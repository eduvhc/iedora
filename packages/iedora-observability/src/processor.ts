import type { Context } from "@opentelemetry/api";
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";

import { IEDORA_TENANT_ID, IEDORA_RESTAURANT_ID } from "./tenant";
import { tenantContext } from "./tenant-context";

/**
 * Span processor that stamps tenant attribution onto every span started
 * inside a `tenantContext.run(...)` block. Mirrors Trigger.dev's
 * `DatasourceAttributeSpanProcessor` (apps/webapp/app/v3/tracer.server.ts)
 * — read a context key on onStart, write a span attribute.
 *
 * The point: most spans we care about are emitted by code that doesn't
 * know it's running inside a tenant context — Next 16's HTTP server
 * spans, @vercel/otel's outbound fetch spans, Drizzle adapter spans
 * created via `tracer.startActiveSpan`. Threading `{ restaurantId }`
 * through every layer would be ugly and easy to forget. This processor
 * does it once at the source — the active context — so every descendant
 * span inherits the attribution for free.
 *
 * Cost: one Map.get + one or two setAttribute calls per span. Cheaper
 * than not having tenancy on dashboards.
 *
 * Idempotent: if onStart fires for a span that ALREADY has the attribute
 * (e.g. a `withTenantSpan` call set it explicitly before the processor
 * ran), setAttribute overwrites with the same value — no-op in effect.
 */
export class TenantContextSpanProcessor implements SpanProcessor {
  onStart(span: Span, _parentContext: Context): void {
    // Read from the AsyncLocalStorage store, NOT from the OTel parent
    // Context. The store is populated by tenantContext.run(...) at
    // entrypoints; ALS propagates through every async hop transparently.
    // OTel's Context would also work in production (@vercel/otel
    // installs AsyncLocalStorageContextManager), but breaks in tests
    // where no SDK is registered. ALS works in both.
    const tenant = tenantContext.get();
    if (!tenant) return;
    span.setAttribute(IEDORA_RESTAURANT_ID, tenant.restaurantId);
    if (tenant.tenantId) {
      span.setAttribute(IEDORA_TENANT_ID, tenant.tenantId);
    }
  }

  // SpanProcessor contract requires both lifecycle hooks plus shutdown +
  // forceFlush. We only care about onStart; the rest are no-ops because
  // we don't buffer or export anything ourselves — @vercel/otel's
  // batch processor handles the export pipeline downstream.
  onEnd(_span: ReadableSpan): void {}

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
