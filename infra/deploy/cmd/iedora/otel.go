package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.27.0"
)

// otel.go — wires OpenTelemetry traces + metrics for the `iedora`
// orchestrator. Spans get emitted around every `docker run` (the
// migrate container, future Stage 3 SSH calls, deploy hot-swaps), and
// the trace context is propagated into spawned processes via the W3C
// `TRACEPARENT` env var so the container-side instrumentation
// (packages/db/scripts/run-migrations.mjs + registerIedoraOtelNode)
// stitches its spans onto ours.
//
// Same OpenObserve endpoint as the Next.js apps. Same service.namespace
// `iedora`. Service name is set per-binary (`iedora-orchestrator` here)
// so the dashboards can filter by emitter.

const serviceNameOrchestrator = "iedora-orchestrator"

// setupOtel registers the global TracerProvider + MeterProvider. Returns
// a shutdown function the caller MUST defer; without it the BatchSpan
// processor and PeriodicExportingMetricReader never flush before the
// binary exits and the tail of spans/metrics is lost.
//
// No-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset: the global providers
// stay as the API's defaults (which are no-ops), and tracer/meter calls
// elsewhere in this binary still compile + run, just don't emit.
func setupOtel(ctx context.Context) (shutdown func(context.Context) error, err error) {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		fmt.Fprintln(os.Stderr, "[iedora-otel] OTEL_EXPORTER_OTLP_ENDPOINT not set; traces, metrics will not be exported.")
		// Still install W3C propagator so we can inject TRACEPARENT
		// into the container's env even when we're not emitting. The
		// container can choose to honour it (with its own OTel config)
		// or drop it.
		otel.SetTextMapPropagator(propagation.TraceContext{})
		return func(context.Context) error { return nil }, nil
	}

	// Compose the per-signal URLs by appending the OTLP standard
	// suffixes onto the base endpoint. OO's endpoint env value
	// (e.g. http://localhost:5080/api/default) includes a path prefix;
	// otlphttp's WithEndpoint takes only host:port, so we'd lose that
	// prefix. WithEndpointURL accepts the full URL.
	base := strings.TrimRight(endpoint, "/")
	tracesURL := base + "/v1/traces"
	metricsURL := base + "/v1/metrics"

	// OTLP headers — OO uses Basic auth.
	headers := parseOtlpHeadersFromEnv(os.Getenv("OTEL_EXPORTER_OTLP_HEADERS"))

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceNameOrchestrator),
			semconv.ServiceNamespace("iedora"),
			semconv.DeploymentEnvironmentName(deploymentEnv()),
		),
		resource.WithHost(),
		resource.WithProcess(),
	)
	if err != nil {
		return nil, fmt.Errorf("otel resource: %w", err)
	}

	// Tracer provider.
	traceOpts := []otlptracehttp.Option{
		otlptracehttp.WithEndpointURL(tracesURL),
	}
	if len(headers) > 0 {
		traceOpts = append(traceOpts, otlptracehttp.WithHeaders(headers))
	}
	traceExp, err := otlptracehttp.New(ctx, traceOpts...)
	if err != nil {
		return nil, fmt.Errorf("otel trace exporter: %w", err)
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExp),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)

	// Metric provider — DELTA temporality so OO's `sum()` queries don't
	// double-count on every flush (mirrors the Next.js wiring).
	metricOpts := []otlpmetrichttp.Option{
		otlpmetrichttp.WithEndpointURL(metricsURL),
		otlpmetrichttp.WithTemporalitySelector(func(metric.InstrumentKind) metricdata.Temporality {
			return metricdata.DeltaTemporality
		}),
	}
	if len(headers) > 0 {
		metricOpts = append(metricOpts, otlpmetrichttp.WithHeaders(headers))
	}
	metricExp, err := otlpmetrichttp.New(ctx, metricOpts...)
	if err != nil {
		return nil, fmt.Errorf("otel metric exporter: %w", err)
	}
	mp := metric.NewMeterProvider(
		metric.WithReader(metric.NewPeriodicReader(
			metricExp,
			metric.WithInterval(60*time.Second),
		)),
		metric.WithResource(res),
	)
	otel.SetMeterProvider(mp)

	// Propagator — W3C trace context. Used both ways: any future
	// inbound HTTP would extract here, and outbound process spawns
	// (docker run) inject into env via injectTraceparentEnv below.
	otel.SetTextMapPropagator(propagation.TraceContext{})

	shutdown = func(shutdownCtx context.Context) error {
		// Best-effort flush + shutdown. Bounded by caller's context.
		errs := []error{}
		if err := tp.Shutdown(shutdownCtx); err != nil {
			errs = append(errs, fmt.Errorf("tracer provider shutdown: %w", err))
		}
		if err := mp.Shutdown(shutdownCtx); err != nil {
			errs = append(errs, fmt.Errorf("meter provider shutdown: %w", err))
		}
		if len(errs) == 0 {
			return nil
		}
		return fmt.Errorf("otel shutdown: %v", errs)
	}
	return shutdown, nil
}

// injectTraceparentEnv writes the current span's trace context as a
// `TRACEPARENT=...` entry suitable for passing via `docker run -e`.
// Returns the empty string if there's no active trace.
func injectTraceparentEnv(ctx context.Context) string {
	carrier := propagation.MapCarrier{}
	otel.GetTextMapPropagator().Inject(ctx, carrier)
	if v, ok := carrier["traceparent"]; ok && v != "" {
		return "TRACEPARENT=" + v
	}
	return ""
}

func deploymentEnv() string {
	if v := os.Getenv("DEPLOYMENT_ENV"); v != "" {
		return v
	}
	if v := os.Getenv("NODE_ENV"); v != "" {
		return v
	}
	return "development"
}

func parseOtlpHeadersFromEnv(raw string) map[string]string {
	if raw == "" {
		return nil
	}
	out := map[string]string{}
	for _, pair := range strings.Split(raw, ",") {
		eq := strings.Index(pair, "=")
		if eq <= 0 {
			continue
		}
		key := strings.TrimSpace(pair[:eq])
		if key == "" {
			continue
		}
		// Values may be URL-encoded so colon-heavy auth survives the
		// `,` delimiter. Mirror the JS-side parser in
		// packages/iedora-observability/src/register.ts.
		val := strings.TrimSpace(pair[eq+1:])
		val = strings.ReplaceAll(val, "%20", " ")
		val = strings.ReplaceAll(val, "%3D", "=")
		out[key] = val
	}
	return out
}
