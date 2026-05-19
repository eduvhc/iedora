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
export const IEDORA_ORGANIZATION_ID = "tenant.organization_id" as const;

export type TenantAttrs = {
  /** Required. The restaurant whose data the span touches. */
  restaurantId: string;
  /** The owning organization, when known. Recommended. */
  organizationId?: string;
};

/**
 * Wrap a request-scoped operation in a span tagged with tenant attributes,
 * then run `fn` inside it. The span is ended automatically — even on throw —
 * and exceptions are surfaced both as a span status AND re-thrown so the
 * caller's error handling still runs.
 *
 *   await withTenantSpan('load-public-menu', { restaurantId, organizationId }, async () => {
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
    if (attrs.organizationId) {
      span.setAttribute(IEDORA_ORGANIZATION_ID, attrs.organizationId);
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
