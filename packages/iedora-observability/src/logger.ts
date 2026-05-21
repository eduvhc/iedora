import { logs, type Logger } from "@opentelemetry/api-logs";

/**
 * Pre-configured Logger for iedora-namespaced structured logs. Mirrors
 * the `tracer` and `meter` exports — same pattern, no per-call-site
 * boilerplate around `logs.getLogger(...)`.
 *
 *   import { logger } from '@iedora/observability'
 *   logger.emit({ severityNumber: SeverityNumber.INFO, body: 'menu published' })
 *
 * Most application code should NOT call this directly. Use pino in
 * application code; `@opentelemetry/instrumentation-pino` (wired by
 * `registerIedoraOtel`) auto-bridges pino records into this logger via
 * the global LoggerProvider. Direct emits are reserved for the
 * iedora-observability package itself and one-off telemetry spots
 * (e.g. shutdown traces).
 *
 * Before `registerIedoraOtel()` runs (or in NODE_ENV=test), this is the
 * global no-op logger from `@opentelemetry/api-logs` — emits are
 * silently dropped, so unconditional logger.emit() calls are safe.
 *
 * The logger name `iedora` shows up as `instrumentation_scope.name` on
 * every emitted record — distinguishes our package's records from
 * pino's (`@opentelemetry/instrumentation-pino`) and any future
 * library's records.
 */
export const logger: Logger = logs.getLogger("iedora");
