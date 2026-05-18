import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  type IdentityEvent,
  type IdentityWebhookEnvelope,
} from "./events";
import {
  formatStripeStyleHeader,
  signSignedPayload,
} from "./signature";
import { validateWebhookUrl } from "./ssrf";
import type { DeliveryResult, WebhookSubscription } from "./types";

export type SenderOptions = {
  /**
   * Subscription lookup. Called once per `emit()` so subscriptions can be
   * added/removed without restarting the sender.
   */
  listSubscriptions(): Promise<WebhookSubscription[]>;
  /**
   * Per-attempt telemetry hook. Receives a result for every attempt — both
   * the successful one and any preceding failures. Default: console.log.
   */
  onDelivery?(result: DeliveryResult): void;
  /**
   * Retry policy. Defaults: 3 attempts, exponential backoff 0.5s, 2s, 8s.
   * `attempt` is 1-indexed; `backoffMs(attempt)` is the delay BEFORE that
   * attempt (so backoffMs(1) === 0 in the default).
   */
  retries?: {
    attempts: number;
    backoffMs: (attempt: number) => number;
  };
  /** Injected fetch — defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /**
   * Injected id factory. Defaults to a small monotonic-ish hex generator
   * sufficient for the envelope `id` field (NOT a UUID).
   */
  idFactory?: () => string;
  /** Injected clock — returns the ISO timestamp for `occurred_at`. */
  now?: () => Date;
  /**
   * Per-attempt request timeout in milliseconds. Default 10_000.
   * Implemented via AbortSignal so it works against fetch implementations
   * that respect signals.
   */
  timeoutMs?: number;
  /**
   * SSRF escape hatch — allow subscription URLs that resolve to private,
   * loopback, link-local, or cloud-metadata addresses. **Default: false.**
   * Production MUST leave this off; tests and local dev opt in explicitly.
   *
   * Even when true, non-`http(s):` protocols are still rejected.
   */
  allowPrivateNetworks?: boolean;
};

const DEFAULT_RETRY = {
  attempts: 3,
  backoffMs: (attempt: number) =>
    attempt <= 1 ? 0 : Math.min(8_000, 500 * Math.pow(4, attempt - 2)),
};

function defaultIdFactory(): string {
  // 16 bytes of randomness, base36 — short, URL-safe, plenty of entropy
  // for our outbox de-dup keys.
  const bytes = new Uint8Array(12);
  // crypto.getRandomValues is on the global in Node 22+.
  globalThis.crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `evt_${hex}`;
}

function sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
}

/**
 * One sender instance per process. Genkan instantiates the singleton once
 * inside its webhooks slice (`products/genkan/src/features/webhooks/`).
 *
 * Retry policy:
 *  - 5xx and network errors → retry up to `attempts`.
 *  - 4xx → terminal, no retry (subscriber rejected the payload).
 *  - 2xx → success.
 *
 * Security: every subscription URL is run through {@link validateWebhookUrl}
 * before each delivery (NOT once at registration time — DNS records and
 * subscription rows can both change between then and now). A failed
 * validation is emitted as a `failed` `DeliveryResult` with `error`
 * starting with `ssrf:` and the request is **not** attempted.
 */
export function createWebhookSender(opts: SenderOptions) {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(
      "@iedora/identity: no fetch implementation available — pass opts.fetch",
    );
  }
  const retry = opts.retries ?? DEFAULT_RETRY;
  const onDelivery =
    opts.onDelivery ??
    ((r: DeliveryResult) => {
      // Sensible default: log failures, silent on success.
      if (r.status === "failed") {
        console.warn(
          `[iedora-identity] delivery failed: ${r.event} → ${r.url} attempt=${r.attempt} http=${r.http ?? "-"} error=${r.error ?? "-"}`,
        );
      }
    });
  const idFactory = opts.idFactory ?? defaultIdFactory;
  const now = opts.now ?? (() => new Date());
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const allowPrivateNetworks = opts.allowPrivateNetworks ?? false;

  async function deliverOne(
    sub: WebhookSubscription,
    envelope: IdentityWebhookEnvelope,
    body: string,
  ): Promise<void> {
    // SSRF check — run once per emit (not per retry), since the resolved
    // address is what we want to lock in. A failure is terminal for this
    // subscription: retrying a private-network URL would just re-block.
    const validation = await validateWebhookUrl(sub.url, {
      allowPrivateNetworks,
    });
    if (!validation.ok) {
      onDelivery({
        url: sub.url,
        event: envelope.event,
        attempt: 1,
        status: "failed",
        error: `ssrf: ${validation.reason}`,
      });
      return;
    }

    let lastErr: string | undefined;
    let lastHttp: number | undefined;
    for (let attempt = 1; attempt <= retry.attempts; attempt++) {
      await sleep(retry.backoffMs(attempt));

      // Bind the timestamp at attempt time — each retry gets a fresh `t=`.
      // That keeps a long-stuck retry from arriving outside the receiver's
      // freshness window.
      const timestampMs = now().getTime();
      const signature = formatStripeStyleHeader(
        timestampMs,
        signSignedPayload(sub.secret, timestampMs, body),
      );

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(sub.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [SIGNATURE_HEADER]: signature,
            [TIMESTAMP_HEADER]: String(timestampMs),
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        lastHttp = res.status;
        if (res.status >= 200 && res.status < 300) {
          onDelivery({
            url: sub.url,
            event: envelope.event,
            attempt,
            status: "ok",
            http: res.status,
          });
          return;
        }
        const text = await res.text().catch(() => "");
        lastErr = text ? `HTTP ${res.status}: ${text.slice(0, 200)}` : `HTTP ${res.status}`;
        onDelivery({
          url: sub.url,
          event: envelope.event,
          attempt,
          status: "failed",
          http: res.status,
          error: lastErr,
        });
        // 4xx is terminal — subscriber rejected this payload, retrying
        // is pointless. 5xx falls through to the retry loop.
        if (res.status >= 400 && res.status < 500) return;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e instanceof Error ? e.message : String(e);
        onDelivery({
          url: sub.url,
          event: envelope.event,
          attempt,
          status: "failed",
          error: lastErr,
        });
        // Network error / abort — retry.
      }
    }
    // Final attempt exhausted — `lastHttp` / `lastErr` already surfaced via
    // onDelivery callbacks, no further action.
    void lastHttp;
    void lastErr;
  }

  async function emit(event: IdentityEvent): Promise<void> {
    const subs = await opts.listSubscriptions();
    const eligible = subs.filter(
      (s) =>
        s.events === undefined ||
        (s.events.length > 0 && s.events.includes(event.event)),
    );
    if (eligible.length === 0) return;

    const envelope: IdentityWebhookEnvelope = {
      id: idFactory(),
      occurred_at: now().toISOString(),
      ...event,
    };
    const body = JSON.stringify(envelope);

    // Fire-and-track in parallel. We deliberately do not surface per-sub
    // failures to the caller — that would couple the originating action
    // to a downstream's availability. The `onDelivery` callback is the
    // observability channel.
    await Promise.all(eligible.map((sub) => deliverOne(sub, envelope, body)));
  }

  return { emit };
}
