/**
 * @iedora/observability — one-line OpenTelemetry wiring for every iedora product.
 *
 * Products consume this package via their `instrumentation.ts`:
 *
 *   import { registerIedoraOtel } from '@iedora/observability'
 *   export function register() { registerIedoraOtel({ serviceName: 'iedora-menu' }) }
 *
 * Everything else (resource attributes, OTLP endpoint, sampling, noise filter,
 * no-op-in-tests behaviour) is centralised here so adding product N+1 is a
 * one-line change in that product's `instrumentation.ts`.
 */
export { registerIedoraOtel, type RegisterOptions } from "./register";
export { tracer } from "./tracer";
export {
  withTenantSpan,
  IEDORA_RESTAURANT_ID,
  IEDORA_ORGANIZATION_ID,
  type TenantAttrs,
} from "./tenant";

/** Re-export the API types callers will actually touch. */
export type { Span, SpanOptions, Tracer } from "@opentelemetry/api";
