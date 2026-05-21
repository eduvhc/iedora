import { registerOTel } from "@vercel/otel";
import {
  AggregationTemporalityPreference,
  OTLPMetricExporter,
} from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import {
  PeriodicExportingMetricReader,
  type MetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BatchLogRecordProcessor,
  type LogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
  SamplingDecision,
  type Sampler,
  type SamplingResult,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  type Attributes,
  type Context,
  type Link,
  type SpanKind,
} from "@opentelemetry/api";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from "@opentelemetry/semantic-conventions";
// `host.name` is still incubating in semconv 1.41.x — separate subpath
// in @opentelemetry/semantic-conventions/package.json::exports. The string
// is well-known and shipped on every fleet host via $HOST_NAME.
import { ATTR_HOST_NAME } from "@opentelemetry/semantic-conventions/incubating";

import { TenantContextSpanProcessor } from "./processor";

/**
 * Default OTLP metric export interval (ms). 60s matches what most
 * dashboards expect — anything faster wastes bandwidth without changing
 * the picture, and anything much slower lags dashboards behind reality.
 * Override per-call via RegisterOptions.metricExportIntervalMs.
 */
const DEFAULT_METRIC_EXPORT_INTERVAL_MS = 60_000;

/**
 * Spans whose name matches any of these regexes are dropped at sampling
 * time — never recorded, never exported. Two big sources of noise:
 *
 *   - `/up` health checks: hit by Caddy + uptime checks. One per
 *     second per host. Useless in traces, would dominate the budget.
 *   - `/api/track/[slug]` view beacon: every public-menu visit fires one.
 *     Same volume problem; the metric is already counted via the row
 *     insert in view_seen. Tracing it adds nothing.
 *   - `GET /api/health` / `GET /api/ready`: container probe spam,
 *     same shape as `/up` but reserved for future health endpoints.
 *
 * Patterns match Next 16's auto-generated span names of shape
 * `[METHOD] [route]`, e.g. `GET /up` or `GET /api/track/[slug]`.
 */
export const NOISE_PATTERNS: RegExp[] = [
  /\s\/up$/,
  /\s\/api\/track\//,
  /\s\/api\/health$/,
  /\s\/api\/ready$/,
];

/**
 * Wraps an inner Sampler with a span-name regex denylist. Filter happens
 * BEFORE the inner sampler, so a denied span costs nothing past the
 * shouldSample() call — no record, no export.
 *
 * Exported for the test suite (`__tests__/sampler.test.ts`). Not re-exported
 * from the barrel — this is an internal mechanism, callers shouldn't
 * construct it directly.
 */
export class NoiseFilteringSampler implements Sampler {
  constructor(private readonly inner: Sampler) {}

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[],
  ): SamplingResult {
    if (NOISE_PATTERNS.some((re) => re.test(spanName))) {
      return { decision: SamplingDecision.NOT_RECORD };
    }
    return this.inner.shouldSample(
      context,
      traceId,
      spanName,
      spanKind,
      attributes,
      links,
    );
  }

  toString(): string {
    return `IedoraNoiseFilter(${this.inner.toString()})`;
  }
}

/**
 * Default sampling: 100% in dev, 10% in prod, error spans always-on (via
 * parent-based propagation — error-marked parents propagate the sampling
 * decision down). Override per-call by passing `sampler` to registerIedoraOtel.
 *
 * Why parent-based: when menu makes a request to genkan, both processes
 * must agree on whether the trace is sampled — otherwise we get half-spans
 * stitched to a nonexistent parent. Parent-based honours the upstream's
 * decision; the root sampler only fires when there's no parent.
 */
export function defaultSampler(environment: string): Sampler {
  const root =
    environment === "production"
      ? new TraceIdRatioBasedSampler(0.1)
      : new AlwaysOnSampler();
  return new NoiseFilteringSampler(new ParentBasedSampler({ root }));
}

export type RegisterOptions = {
  /**
   * Required. The per-product service name (e.g. `iedora-menu`, `iedora-genkan`).
   * Becomes the `service.name` resource attribute on every emitted span; this
   * is what OpenObserve uses to group spans by product.
   */
  serviceName: string;
  /**
   * Optional sampler override. Defaults to parent-based + 10% ratio in prod,
   * always-on in dev, with noise filtering wrapping both. Most callers
   * shouldn't touch this; useful for short-term debugging where you want
   * 100% sampling temporarily.
   */
  sampler?: Sampler;
  /**
   * Override the metric export interval (ms). Defaults to 60s. Useful for
   * tests that want a faster flush, or for high-frequency debugging.
   */
  metricExportIntervalMs?: number;
  /**
   * Inject one or more MetricReaders directly — bypasses the default OTLP
   * exporter setup. Primary use case: tests that pull samples via an
   * in-memory reader. Production callers should not need this.
   */
  metricReaders?: MetricReader[];
  /**
   * Inject one or more LogRecordProcessors directly — bypasses the default
   * OTLP log exporter setup. Tests that want to pull log records via an
   * in-memory processor use this. Production callers should not need it.
   */
  logRecordProcessors?: LogRecordProcessor[];
  /**
   * Append extra span processors. The TenantContextSpanProcessor is always
   * added by the package — these run alongside it. Useful for diagnostic
   * processors (e.g. PostHog's CappedSiblingsExporter) without modifying
   * the package surface.
   */
  extraSpanProcessors?: SpanProcessor[];
};

/**
 * Wire OpenTelemetry traces, metrics, and logs into the host process.
 * Idempotent — calling it twice in the same process is harmless (the
 * second call is a no-op via `globalThis.__iedora_otel_registered`).
 *
 * Behaviour by environment:
 *
 *   - `NODE_ENV === 'test'` → no-op. The PGLite Vitest suites stay fast
 *     and don't try to reach the OTLP collector that isn't running.
 *   - `OTEL_EXPORTER_OTLP_ENDPOINT` unset → @vercel/otel falls back to its
 *     internal Vercel-platform exporter (we're not on Vercel, so traces
 *     just drop). Log once so the gap is visible.
 *   - Edge runtime → caller's `instrumentation.ts` already gates on
 *     `NEXT_RUNTIME === 'nodejs'`, so we don't double-check.
 *
 * Resource attributes are pulled from the process env so they match the
 * fleet manifest one-to-one (see issue #8):
 *
 *   service.namespace          = "iedora" (constant)
 *   service.name               = opts.serviceName
 *   service.version            = $GIT_SHA (CI passes on container build)
 *   deployment.environment     = $DEPLOYMENT_ENV ?? NODE_ENV
 *   host.name                  = $HOST_NAME (Tofu injects per fleet.tf)
 *
 * Three signals get wired in one call:
 *
 *   - Traces via @vercel/otel's BatchSpanProcessor → OTLP HTTP proto.
 *     The TenantContextSpanProcessor runs alongside, stamping
 *     tenant.restaurant_id / tenant.organization_id from the active
 *     Context onto every span — see processor.ts.
 *   - Metrics via PeriodicExportingMetricReader + OTLPMetricExporter,
 *     DELTA temporality (load-bearing for OpenObserve sum() queries).
 *   - Logs via BatchLogRecordProcessor + OTLPLogExporter, plus
 *     PinoInstrumentation bridging pino records to the global
 *     LoggerProvider (injects trace_id/span_id automatically).
 */
export function registerIedoraOtel(opts: RegisterOptions): void {
  if (process.env.NODE_ENV === "test") return;

  const globalKey = "__iedora_otel_registered" as const;
  const g = globalThis as { [globalKey]?: boolean };
  if (g[globalKey]) return;
  g[globalKey] = true;

  const environment =
    process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV ?? "development";

  if (
    !process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
    !opts.metricReaders &&
    !opts.logRecordProcessors
  ) {
    // Visible at boot, not on every request. Without an OTLP endpoint
    // @vercel/otel falls back to a no-op (off-Vercel), so traces AND
    // metrics AND logs silently vanish. One line in the logs is cheaper
    // than wondering why OpenObserve is empty. The `metricReaders` /
    // `logRecordProcessors` escape hatches suppress the warning for
    // tests that inject a reader/processor.
    console.warn(
      `[iedora-observability] OTEL_EXPORTER_OTLP_ENDPOINT not set; traces, metrics and logs will not be exported (env=${environment}).`,
    );
  }

  // Resource attributes — exact semconv keys via the typed constants
  // (string drift is what breaks dashboards). Build the object literal
  // and let undefineds get filtered by the spread below.
  const resource: Record<string, string> = {
    [ATTR_SERVICE_NAME]: opts.serviceName,
    [ATTR_SERVICE_NAMESPACE]: "iedora",
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: environment,
  };
  if (process.env.GIT_SHA) {
    resource[ATTR_SERVICE_VERSION] = process.env.GIT_SHA;
  }
  if (process.env.HOST_NAME) {
    resource[ATTR_HOST_NAME] = process.env.HOST_NAME;
  }

  // Metric readers: explicit injection (tests) wins; otherwise build a
  // PeriodicExportingMetricReader pointed at the OTLP endpoint. @vercel/otel
  // does NOT auto-configure metric exporters even when the trace endpoint
  // is set — see the package's Configuration type, where metricReaders
  // is "[]" by default. The exporter consults OTEL_EXPORTER_OTLP_ENDPOINT
  // and OTEL_EXPORTER_OTLP_HEADERS itself.
  //
  // `temporalityPreference: DELTA` is load-bearing. The OTLP exporter
  // defaults to CUMULATIVE — every 60s flush would resend the
  // process-lifetime counter total, and the documented `sum(value)` queries
  // in docs/observability.md would re-count the same events on every
  // flush until the process restarts. DELTA exports only "events since
  // last flush" — sum() over a window then gives the right answer. Per
  // the OTLP metrics spec, DELTA is the recommended preference for
  // dashboards that aggregate via sum(). Pinned here against the default.
  const metricReaders =
    opts.metricReaders ??
    (process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
              temporalityPreference: AggregationTemporalityPreference.DELTA,
            }),
            exportIntervalMillis:
              opts.metricExportIntervalMs ?? DEFAULT_METRIC_EXPORT_INTERVAL_MS,
          }),
        ]
      : []);

  // Log record processors. Same shape as metricReaders — explicit
  // injection wins for tests, otherwise wire a Batch processor over the
  // OTLP exporter. @vercel/otel registers the LoggerProvider globally
  // when given any processors, so PinoInstrumentation (registered below)
  // finds the global provider on first emit. The Batch processor is
  // important: BatchLogRecordProcessor flushes at most every 5s by
  // default vs SimpleLogRecordProcessor's per-record export — at our
  // log volume the difference is the difference between OO ingest
  // keeping up and not.
  const logRecordProcessors =
    opts.logRecordProcessors ??
    (process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? [new BatchLogRecordProcessor(new OTLPLogExporter())]
      : []);

  // Always include TenantContextSpanProcessor — it's what makes
  // tenantContext.run(...) actually stamp tenant attributes onto child
  // spans created inside the block. Without this processor in the
  // pipeline, the context value exists but no span ever reads it.
  // Order matters only relative to other processors that READ tenant
  // attrs (none today); the eventual BatchSpanProcessor downstream
  // sees the attribute regardless.
  const spanProcessors: SpanProcessor[] = [
    new TenantContextSpanProcessor(),
    ...(opts.extraSpanProcessors ?? []),
  ];

  registerOTel({
    serviceName: opts.serviceName,
    attributes: resource,
    traceSampler: opts.sampler ?? defaultSampler(environment),
    metricReaders,
    logRecordProcessors,
    spanProcessors,
    // Pino bridge: when application code does `logger.info(...)` against
    // a pino logger, the instrumentation (a require-hook around `pino`)
    // injects trace_id/span_id from the active context AND mirrors the
    // record to the global LoggerProvider. Apps that haven't migrated to
    // pino are unaffected — the instrumentation is a no-op until pino
    // is actually required.
    //
    // The literal "fetch" string is @vercel/otel's named default; we
    // append PinoInstrumentation rather than replacing fetch.
    instrumentations: ["fetch", new PinoInstrumentation()],
  });
}
