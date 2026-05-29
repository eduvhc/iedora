import { metrics, type Meter } from "@opentelemetry/api";

/**
 * Pre-configured Meter for iedora-namespaced instruments. Mirrors the
 * `tracer` export — same pattern, no per-call-site boilerplate around
 * `metrics.getMeter(...)`.
 *
 *   import { meter } from '@iedora/observability'
 *   const counter = meter.createCounter('iedora.something_total', {
 *     description: 'What you are counting',
 *   })
 *   counter.add(1, tenantAttributes({ restaurantId, tenantId }))
 *
 * Convention: instrument names are lowercase snake_case under the
 * `iedora.` namespace (e.g. `iedora.restaurant_views_total`). The OTel
 * spec recommends namespacing per service group; `iedora.` keeps our
 * instruments distinct from anything Next 16 auto-emits.
 *
 * Before `registerIedoraOtel()` runs, this is the global no-op meter
 * from `@opentelemetry/api` — safe to create counters/histograms/gauges
 * on, they just don't emit. Same shape as `tracer`.
 */
export const meter: Meter = metrics.getMeter("iedora");
