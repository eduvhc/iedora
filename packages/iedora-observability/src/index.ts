/**
 * @iedora/observability — one-line OpenTelemetry wiring for every iedora product.
 *
 * Products consume this package via their `instrumentation.ts`:
 *
 *   import { registerIedoraOtel } from '@iedora/observability'
 *   export function register() { registerIedoraOtel({ serviceName: 'iedora-menu' }) }
 *
 * Everything else (resource attributes, OTLP endpoint, sampling, noise
 * filter, tenant-context span processor, logs + metrics export, pino
 * bridge, no-op-in-tests behaviour) is centralised here so adding
 * product N+1 is a one-line change in that product's `instrumentation.ts`.
 */
export {
  registerIedoraOtel,
  shutdownIedoraOtel,
  type RegisterOptions,
} from "./register";
export {
  registerIedoraOtelNode,
  type RegisterNodeOptions,
} from "./register-node";
export { tracer } from "./tracer";
export { meter } from "./meter";
export { logger } from "./logger";
export {
  withTenantSpan,
  tenantAttributes,
  IEDORA_RESTAURANT_ID,
  IEDORA_TENANT_ID,
  type TenantAttrs,
} from "./tenant";
export { tenantContext } from "./tenant-context";
export { TenantContextSpanProcessor } from "./processor";

/** Re-export the API types callers will actually touch. */
export type {
  Counter,
  Histogram,
  Meter,
  Span,
  SpanOptions,
  Tracer,
  UpDownCounter,
} from "@opentelemetry/api";

/**
 * Re-export the runtime values from `@opentelemetry/api` that callers
 * commonly need. Consumers should import everything OTel-related through
 * `@iedora/observability` so per-product `package.json` files only need
 * one dep — and so `bun build` can resolve the import graph from a single
 * workspace root (e.g. inside the migrate container Dockerfile).
 */
export { context, propagation, SpanStatusCode, SpanKind } from "@opentelemetry/api";
export type { Logger, LogRecord } from "@opentelemetry/api-logs";
export { SeverityNumber } from "@opentelemetry/api-logs";
