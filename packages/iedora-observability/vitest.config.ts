import { defineConfig } from "vitest/config";

/**
 * Plain-node test surface. We never boot the real OTel SDK in tests —
 * `registerIedoraOtel` short-circuits when `NODE_ENV === 'test'`, which is
 * what these specs assert. `withTenantSpan` is exercised against the
 * no-op tracer from `@opentelemetry/api` (the API's default when no SDK
 * is registered) and asserts that attributes don't blow up the call.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 5_000,
  },
});
