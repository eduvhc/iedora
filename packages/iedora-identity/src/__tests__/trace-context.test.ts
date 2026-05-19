import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import {
  context,
  propagation,
  trace,
  type Context,
  type TextMapPropagator,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { createWebhookSender } from "../sender";
import { createWebhookReceiver } from "../receiver";
import { formatStripeStyleHeader, signSignedPayload } from "../signature";
import { SIGNATURE_HEADER } from "../events";
import type { WebhookSubscription } from "../types";

/**
 * Minimal W3C-shaped propagator written in the test so we don't need to
 * pull `@opentelemetry/core` into the package just for spec coverage.
 * Reads/writes the single `traceparent` field — sufficient to prove the
 * sender injects on outbound and the receiver extracts on inbound.
 *
 * Format mirrors the real W3C propagator: `00-<traceId>-<spanId>-<flags>`.
 */
const TRACEPARENT = "traceparent" as const;

class FakeTraceparentPropagator implements TextMapPropagator {
  inject(
    ctx: Context,
    carrier: unknown,
    setter: { set: (carrier: unknown, key: string, value: string) => void },
  ): void {
    // `getSpanContext` is the right read here: extracted contexts (the
    // receiver side) only ever carry the raw SpanContext, not a full Span.
    // `getSpan` would return undefined for those, and we'd silently emit
    // nothing on the next hop.
    const sc = trace.getSpanContext(ctx);
    if (!sc) return;
    setter.set(
      carrier,
      TRACEPARENT,
      `00-${sc.traceId}-${sc.spanId}-${sc.traceFlags.toString(16).padStart(2, "0")}`,
    );
  }

  extract(
    ctx: Context,
    carrier: unknown,
    getter: {
      get: (carrier: unknown, key: string) => string | string[] | undefined;
    },
  ): Context {
    const value = getter.get(carrier, TRACEPARENT);
    const headerValue = Array.isArray(value) ? value[0] : value;
    if (typeof headerValue !== "string") return ctx;
    const parts = headerValue.split("-");
    if (parts.length !== 4) return ctx;
    const [, traceId, spanId, flagsHex] = parts;
    if (!traceId || !spanId || !flagsHex) return ctx;
    return trace.setSpanContext(ctx, {
      traceId,
      spanId,
      traceFlags: Number.parseInt(flagsHex, 16),
      isRemote: true,
    });
  }

  fields(): string[] {
    return [TRACEPARENT];
  }
}

/** Synthetic SpanContext used for sender-side tests. */
const FAKE_SPAN_CONTEXT = {
  traceId: "0af7651916cd43dd8448eb211c80319c",
  spanId: "b7ad6b7169203331",
  traceFlags: 1,
  isRemote: false,
};

describe("trace context propagation", () => {
  const contextManager = new AsyncLocalStorageContextManager();

  beforeAll(() => {
    // Production wires both globals via @vercel/otel during register().
    // Tests have neither by default — propagation.inject would no-op and
    // context.with wouldn't actually activate the passed context. We
    // install minimal versions so the assertions reflect the real path.
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    propagation.setGlobalPropagator(new FakeTraceparentPropagator());
  });

  afterAll(() => {
    propagation.disable();
    context.disable();
    contextManager.disable();
  });

  it("sender injects traceparent when an active span context exists", async () => {
    const seenHeaders: Record<string, string>[] = [];
    const fetchFn = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        seenHeaders.push(
          (init?.headers as Record<string, string> | undefined) ?? {},
        );
        return new Response("ok", { status: 200 });
      },
    );

    const subs: WebhookSubscription[] = [
      { url: "https://hooks.example.test/h", secret: "s" },
    ];
    const sender = createWebhookSender({
      listSubscriptions: async () => subs,
      fetch: fetchFn as unknown as typeof fetch,
      retries: { attempts: 1, backoffMs: () => 0 },
      allowPrivateNetworks: true,
    });

    // Active context with a known span — same shape genkan would have at
    // the moment of emit().
    const ctxWithSpan = trace.setSpanContext(context.active(), FAKE_SPAN_CONTEXT);
    await context.with(ctxWithSpan, () =>
      sender.emit({ event: "user.deleted", payload: { user_id: "u1" } }),
    );

    expect(seenHeaders).toHaveLength(1);
    const traceparent = seenHeaders[0]?.[TRACEPARENT];
    expect(traceparent).toBeDefined();
    expect(traceparent).toContain(FAKE_SPAN_CONTEXT.traceId);
  });

  it("sender omits traceparent when no active span context exists", async () => {
    const seenHeaders: Record<string, string>[] = [];
    const fetchFn = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        seenHeaders.push(
          (init?.headers as Record<string, string> | undefined) ?? {},
        );
        return new Response("ok", { status: 200 });
      },
    );

    const sender = createWebhookSender({
      listSubscriptions: async () => [
        { url: "https://hooks.example.test/h", secret: "s" },
      ],
      fetch: fetchFn as unknown as typeof fetch,
      retries: { attempts: 1, backoffMs: () => 0 },
      allowPrivateNetworks: true,
    });

    // No `context.with(...)` — propagator's `getSpan(ctx)` returns
    // undefined and the no-op span never produces a header.
    await sender.emit({ event: "user.deleted", payload: { user_id: "u1" } });

    expect(seenHeaders).toHaveLength(1);
    expect(seenHeaders[0]?.[TRACEPARENT]).toBeUndefined();
  });

  it("receiver runs the handler inside the extracted upstream context", async () => {
    const secret = "shared-secret";
    let observedTraceId: string | undefined;

    const receiver = createWebhookReceiver({
      secret,
      on: {
        "user.deleted": async () => {
          observedTraceId = trace.getSpan(context.active())?.spanContext().traceId;
        },
      },
    });

    const body = JSON.stringify({
      id: "evt_test_1",
      occurred_at: new Date().toISOString(),
      event: "user.deleted",
      payload: { user_id: "u1" },
    });
    const t = Date.now();
    const sig = formatStripeStyleHeader(
      t,
      signSignedPayload(secret, t, body),
    );

    const upstreamTraceparent = `00-${FAKE_SPAN_CONTEXT.traceId}-${FAKE_SPAN_CONTEXT.spanId}-01`;
    const req = new Request("https://r.example.test/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: sig,
        [TRACEPARENT]: upstreamTraceparent,
      },
      body,
    });

    const res = await receiver.POST(req);
    expect(res.status).toBe(200);
    expect(observedTraceId).toBe(FAKE_SPAN_CONTEXT.traceId);
  });
});
