import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `registerIedoraOtel` must be a no-op when NODE_ENV === 'test'. This is
 * load-bearing for the PGLite Vitest suites in menu + genkan: they boot
 * 50+ test databases per run, and we don't want each one trying to reach
 * a non-existent OTLP collector.
 *
 * The check is also a quick smoke against accidentally calling
 * `registerOTel` from @vercel/otel in the test env (which would fail
 * loudly the first time CI ran).
 */
describe("registerIedoraOtel", () => {
  beforeEach(() => {
    // Each test gets a clean global-flag slate. The "already registered"
    // sentinel is intentionally process-scoped at runtime — for tests we
    // wipe it so each case starts from scratch.
    const g = globalThis as Record<string, unknown>;
    delete g.__iedora_otel_registered;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when NODE_ENV === 'test'", async () => {
    const { registerIedoraOtel } = await import("../register");
    // Vitest sets NODE_ENV=test by default — confirm the assumption then
    // call. No throw, no console output. The fact that this test exists
    // at all means @vercel/otel was importable without side-effects.
    expect(process.env.NODE_ENV).toBe("test");
    expect(() => registerIedoraOtel({ serviceName: "iedora-test" })).not.toThrow();
  });

  it("warns once when OTEL_EXPORTER_OTLP_ENDPOINT is unset and NODE_ENV !== 'test'", async () => {
    // Flip NODE_ENV for this case so the early return doesn't swallow
    // the warning. Restore on the way out.
    const originalNodeEnv = process.env.NODE_ENV;
    const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.NODE_ENV = "production";
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const { registerIedoraOtel } = await import("../register");
      registerIedoraOtel({ serviceName: "iedora-test-missing-endpoint" });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("OTEL_EXPORTER_OTLP_ENDPOINT not set"),
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalEndpoint !== undefined) {
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
      }
    }
  });
});
