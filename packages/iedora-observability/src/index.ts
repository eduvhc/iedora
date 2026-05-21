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
export { registerIedoraOtel, type RegisterOptions } from "./register";
export { tracer } from "./tracer";
export { meter } from "./meter";
export { logger } from "./logger";
export {
  withTenantSpan,
  tenantAttributes,
  IEDORA_RESTAURANT_ID,
  IEDORA_ORGANIZATION_ID,
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
export type { Logger, LogRecord } from "@opentelemetry/api-logs";
export { SeverityNumber } from "@opentelemetry/api-logs";
