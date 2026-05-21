import { describe, expect, it } from "vitest";
import { SeverityNumber } from "@opentelemetry/api-logs";

import { logger } from "../logger";

/**
 * The `logger` export resolves through the global LogsAPI. No SDK is
 * registered in tests (NODE_ENV=test short-circuits registerIedoraOtel),
 * so the value at module import is the no-op global logger from
 * @opentelemetry/api-logs.
 *
 * These tests cover the surface contract:
 *   1. The export exists and exposes `.emit`.
 *   2. Emitting against the no-op logger does not throw — application
 *      code can call logger.emit unconditionally without an SDK check.
 */
describe("logger surface", () => {
  it("exports a Logger-shaped object with emit()", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.emit).toBe("function");
  });

  it("emit() is a no-op without an SDK and does not throw", () => {
    // The point: callers don't have to guard `if (sdkRegistered)` —
    // logger.emit() degrades to a silent no-op when no LoggerProvider
    // is set globally. Same contract as `tracer` and `meter`.
    expect(() =>
      logger.emit({
        severityNumber: SeverityNumber.INFO,
        body: "test message",
        attributes: { "iedora.test": "true" },
      }),
    ).not.toThrow();
  });

  it("accepts the full LogRecord shape (severity + body + attributes + timestamp)", () => {
    expect(() =>
      logger.emit({
        timestamp: Date.now(),
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
        body: { event: "menu_publish_failed", restaurantId: "r_test" },
        attributes: {
          "iedora.restaurant_id": "r_test",
          "iedora.error.code": "E_PUBLISH",
        },
      }),
    ).not.toThrow();
  });
});
