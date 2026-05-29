import { SpanStatusCode } from "@opentelemetry/api";
import { tracer } from "./tracer";

/**
 * Tenant attribute keys — pinned constants instead of free-text strings so
 * dashboards / alerts that filter by these keys don't break on typos.
 *
 * Tenancy lives on spans, NOT on resource attributes — one Node process
 * serves N restaurants/orgs, so `restaurant.id` would be wrong as a
 * resource (which is per-process). See the iedora-observability README.
 */
export const IEDORA_RESTAURANT_ID = "tenant.restaurant_id" as const;
export const IEDORA_TENANT_ID = "tenant.id" as const;

export type TenantAttrs = {
  /** Required. The restaurant whose data the span touches. */
  restaurantId: string;
  /** The owning organization, when known. Recommended. */
  tenantId?: string;
};

/**
 * Build the canonical tenant-attribute record for a metric instrument's
 * `.add` / `.record` call. The same shape `withTenantSpan` writes onto
 * spans — using both keeps span filters and metric filters in lock-step
 * so a query for `tenant.restaurant_id = X` returns matching slices of
 * both signals.
 *
 *   const counter = meter.createCounter('iedora.foo_total')
 *   counter.add(1, tenantAttributes({ restaurantId, tenantId }))
 *
 * Returns a plain attribute object — safe to spread with other
 * non-tenant attributes (`{ ...tenantAttributes(t), 'iedora.language': 'pt' }`).
 */
export function tenantAttributes(
  attrs: TenantAttrs,
): Record<string, string> {
  const out: Record<string, string> = {
    [IEDORA_RESTAURANT_ID]: attrs.restaurantId,
  };
  if (attrs.tenantId) {
    out[IEDORA_TENANT_ID] = attrs.tenantId;
  }
  return out;
}

/**
 * Wrap a request-scoped operation in a span tagged with tenant attributes,
 * then run `fn` inside it. The span is ended automatically — even on throw —
 * and exceptions are surfaced both as a span status AND re-thrown so the
 * caller's error handling still runs.
 *
 *   await withTenantSpan('load-public-menu', { restaurantId, tenantId }, async () => {
 *     return loadRestaurantSnapshot(slug)
 *   })
 *
 * Cheap when no SDK is registered — the no-op tracer short-circuits the
 * span machinery and `fn()` runs unchanged.
 */
export async function withTenantSpan<T>(
  spanName: string,
  attrs: TenantAttrs,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(spanName, async (span) => {
    span.setAttribute(IEDORA_RESTAURANT_ID, attrs.restaurantId);
    if (attrs.tenantId) {
      span.setAttribute(IEDORA_TENANT_ID, attrs.tenantId);
    }
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}
