import { metrics, trace, propagation } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  AggregationTemporalityPreference,
  OTLPMetricExporter,
} from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes, defaultResource } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ParentBasedSampler,
  AlwaysOnSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from "@opentelemetry/semantic-conventions";
import { ATTR_HOST_NAME } from "@opentelemetry/semantic-conventions/incubating";

import { TenantContextSpanProcessor } from "./processor";

/**
 * Bundle-friendly OTel registration for short-lived Node scripts.
 *
 * Why a separate function from `registerIedoraOtel` (which uses
 * `@vercel/otel`): the @vercel/otel layer doesn't survive `bun build`
 * into a single distroless-node ESM bundle. The bundled output throws
 * `Cannot access 'a2' before initialization` at runtime — a hoisting
 * / TDZ failure in the package's internal module graph that the
 * bundler can't statically reorder.
 *
 * This function wires the same OTel signals (traces + metrics) but
 * against the underlying SDKs directly:
 *
 *   - `BasicTracerProvider` + `BatchSpanProcessor` + `OTLPTraceExporter`
 *   - `MeterProvider` + `PeriodicExportingMetricReader` + `OTLPMetricExporter`
 *
 * Same Resource attrs (`service.name`, `service.namespace`,
 * `service.version`, `deployment.environment`, `host.name`), same
 * DELTA temporality (load-bearing for OpenObserve's `sum()` queries —
 * see register.ts notes), same parent-based sampling (so the migrate
 * container honours the Go orchestrator's sampling decision when
 * `TRACEPARENT` arrives via env). The W3C trace-context propagator is
 * registered as the global propagator so `propagation.extract(...)` /
 * `inject(...)` work with no extra wiring.
 *
 * Use for any short-lived Node script (migrations, one-shot CLIs,
 * cron-style jobs) that ships bundled. Pair with `shutdownIedoraOtel()`
 * in a finally — without it the BatchSpanProcessor + metric reader
 * never push to the collector before the process exits.
 *
 * Idempotent — second call in the same process is a no-op via the
 * `globalThis.__iedora_otel_node_registered` flag.
 */
export type RegisterNodeOptions = {
  /** Required. Per-script service name (e.g. `iedora-migrate`). */
  serviceName: string;
  /** Override the metric export interval (ms). Defaults to 60_000. */
  metricExportIntervalMs?: number;
};

const DEFAULT_METRIC_EXPORT_INTERVAL_MS = 60_000;

function defaultSampler(environment: string) {
  const root =
    environment === "production"
      ? new TraceIdRatioBasedSampler(0.1)
      : new AlwaysOnSampler();
  return new ParentBasedSampler({ root });
}

export function registerIedoraOtelNode(opts: RegisterNodeOptions): void {
  if (process.env.NODE_ENV === "test") return;

  const globalKey = "__iedora_otel_node_registered" as const;
  const g = globalThis as { [globalKey]?: boolean };
  if (g[globalKey]) return;
  g[globalKey] = true;

  const environment =
    process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV ?? "development";

  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    // Mirror register.ts: log once at boot so the gap is visible. With
    // no endpoint the OTLP exporters fall through to no-op behaviour,
    // but registering empty providers is still cheap and lets the
    // tracer/meter shims emit spans/metrics that simply don't ship.
    // Useful for unit tests against the helper.
    console.warn(
      `[iedora-observability:node] OTEL_EXPORTER_OTLP_ENDPOINT not set; traces, metrics will not be exported (env=${environment}).`,
    );
  }

  // Resource attrs — exact semconv keys via typed constants. Merge with
  // the SDK's default (process, host, sdk metadata).
  const attrs: Record<string, string> = {
    [ATTR_SERVICE_NAME]: opts.serviceName,
    [ATTR_SERVICE_NAMESPACE]: "iedora",
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: environment,
  };
  if (process.env.GIT_SHA) attrs[ATTR_SERVICE_VERSION] = process.env.GIT_SHA;
  if (process.env.HOST_NAME) attrs[ATTR_HOST_NAME] = process.env.HOST_NAME;
  const resource = defaultResource().merge(resourceFromAttributes(attrs));

  // Tracer provider. BatchSpanProcessor only flushes periodically;
  // shutdownIedoraOtel() flushes synchronously before process exit so
  // short-lived scripts don't drop their tail of spans.
  const traceExporter = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? new OTLPTraceExporter({
        url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, "")}/v1/traces`,
      })
    : undefined;

  const tp = new BasicTracerProvider({
    resource,
    sampler: defaultSampler(environment),
    spanProcessors: [
      // TenantContextSpanProcessor stamps tenant.* attrs from
      // tenantContext.run(...). No-op for migrate scripts that never
      // call into tenantContext, but free + consistent with the Next
      // app's pipeline.
      new TenantContextSpanProcessor(),
      ...(traceExporter ? [new BatchSpanProcessor(traceExporter)] : []),
    ],
  });
  trace.setGlobalTracerProvider(tp);

  // Propagator — make traceparent/tracestate work both ways. The Go
  // orchestrator sets TRACEPARENT in the migrate container's env; the
  // first span we open extracts it as the parent so the trace
  // stitches across the docker run boundary.
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  // Meter provider. DELTA temporality is load-bearing — see register.ts
  // notes. Without it OpenObserve double-counts on every flush.
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const mp = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            temporalityPreference: AggregationTemporalityPreference.DELTA,
          }),
          exportIntervalMillis:
            opts.metricExportIntervalMs ?? DEFAULT_METRIC_EXPORT_INTERVAL_MS,
        }),
      ],
    });
    metrics.setGlobalMeterProvider(mp);
  }
}
