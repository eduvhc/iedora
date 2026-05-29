import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

import { TenantContextSpanProcessor } from "../processor";
import { tenantContext } from "../tenant-context";
import { IEDORA_TENANT_ID, IEDORA_RESTAURANT_ID } from "../tenant";

/**
 * TenantContextSpanProcessor stamps tenant.restaurant_id /
 * tenant.organization_id from the active tenantContext scope onto every
 * started span. We wire a real BasicTracerProvider + InMemorySpanExporter
 * so we can assert the attributes show up on the exported span, not
 * just trust the onStart code path in isolation.
 */
describe("TenantContextSpanProcessor", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      // Order is intentional: tenant processor first (mutates spans on
      // start), exporter second (reads finished spans). Both are simple
      // processors so we can assert immediately after span.end().
      spanProcessors: [
        new TenantContextSpanProcessor(),
        new SimpleSpanProcessor(exporter),
      ],
    });
  });

  afterEach(async () => {
    await provider.shutdown();
    exporter.reset();
  });

  it("stamps tenant attributes onto spans started inside tenantContext.run", () => {
    const tracer = provider.getTracer("test");

    tenantContext.run(
      { restaurantId: "r_alpha", tenantId: "o_alpha" },
      () => {
        const span = tracer.startSpan("operation-inside-tenant");
        span.end();
      },
    );

    const [exported] = exporter.getFinishedSpans();
    expect(exported).toBeDefined();
    expect(exported?.attributes[IEDORA_RESTAURANT_ID]).toBe("r_alpha");
    expect(exported?.attributes[IEDORA_TENANT_ID]).toBe("o_alpha");
  });

  it("omits organization_id when not set on the context", () => {
    const tracer = provider.getTracer("test");

    tenantContext.run({ restaurantId: "r_no_org" }, () => {
      tracer.startSpan("operation-no-org").end();
    });

    const [exported] = exporter.getFinishedSpans();
    expect(exported?.attributes[IEDORA_RESTAURANT_ID]).toBe("r_no_org");
    // Important: omit, not set-to-undefined. OpenObserve treats undefined
    // attributes as the literal string "undefined" in dashboards — would
    // show up as a fake "(undefined)" bucket on every org-grouped chart.
    expect(IEDORA_TENANT_ID in (exported?.attributes ?? {})).toBe(false);
  });

  it("does NOT stamp attributes when no tenant is set", () => {
    const tracer = provider.getTracer("test");

    // No .run wrapper — span is started against the empty scope.
    tracer.startSpan("operation-outside-tenant").end();

    const [exported] = exporter.getFinishedSpans();
    expect(IEDORA_RESTAURANT_ID in (exported?.attributes ?? {})).toBe(false);
    expect(IEDORA_TENANT_ID in (exported?.attributes ?? {})).toBe(false);
  });

  it("stamps the tenant of the scope the span was started in, not a later scope", () => {
    const tracer = provider.getTracer("test");

    // Start a span under tenant A, then SWITCH the active scope to
    // tenant B and end the span. The processor reads on onStart, so
    // the exported span should carry A's attribution — not B's.
    const span = tenantContext.run({ restaurantId: "r_A" }, () =>
      tracer.startSpan("under-A"),
    );
    tenantContext.run({ restaurantId: "r_B" }, () => {
      span.end();
    });

    const [exported] = exporter.getFinishedSpans();
    expect(exported?.attributes[IEDORA_RESTAURANT_ID]).toBe("r_A");
  });

  it("nested run() yields the innermost tenant for child spans", () => {
    const tracer = provider.getTracer("test");

    tenantContext.run(
      { restaurantId: "r_outer", tenantId: "o_outer" },
      () => {
        tenantContext.run(
          { restaurantId: "r_inner", tenantId: "o_inner" },
          () => {
            tracer.startSpan("inner-span").end();
          },
        );
      },
    );

    const [exported] = exporter.getFinishedSpans();
    expect(exported?.attributes[IEDORA_RESTAURANT_ID]).toBe("r_inner");
    expect(exported?.attributes[IEDORA_TENANT_ID]).toBe("o_inner");
  });

  it("forceFlush and shutdown resolve cleanly (lifecycle no-ops)", async () => {
    const proc = new TenantContextSpanProcessor();
    await expect(proc.forceFlush()).resolves.toBeUndefined();
    await expect(proc.shutdown()).resolves.toBeUndefined();
  });
});
