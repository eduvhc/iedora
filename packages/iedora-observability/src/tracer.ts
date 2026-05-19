import { trace, type Tracer } from "@opentelemetry/api";

/**
 * Pre-configured tracer for iedora-namespaced custom spans. Use this
 * everywhere you want to add a custom span — no per-call-site boilerplate
 * around `trace.getTracer(...)`.
 *
 *   import { tracer } from '@iedora/observability'
 *   await tracer.startActiveSpan('publish-menu', async (span) => { ... })
 *
 * The tracer name `iedora` is what the iedora-emitted spans get tagged
 * with under `otel.scope.name` — useful in OpenObserve when filtering
 * iedora's own spans away from Next 16's auto-instrumented ones.
 *
 * Before `registerIedoraOtel()` runs, this is the global no-op tracer
 * from `@opentelemetry/api` (safe to use, just doesn't emit).
 */
export const tracer: Tracer = trace.getTracer("iedora");
