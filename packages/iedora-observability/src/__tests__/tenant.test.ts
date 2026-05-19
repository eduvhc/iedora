import { describe, expect, it } from "vitest";
import { IEDORA_ORGANIZATION_ID, IEDORA_RESTAURANT_ID, withTenantSpan } from "../tenant";

/**
 * No SDK is registered in tests (registerIedoraOtel returns early when
 * NODE_ENV === 'test'), so withTenantSpan runs against the no-op tracer
 * from @opentelemetry/api. That means we can't introspect the emitted
 * span — but we CAN assert the contract that matters at the call site:
 *
 *   1. `fn` runs and its return value is forwarded.
 *   2. Throws are re-raised (the wrapper must not swallow).
 *   3. The attribute key constants stay stable (they're consumed by
 *      OpenObserve dashboards by literal name).
 */
describe("withTenantSpan", () => {
  it("returns the wrapped function's value", async () => {
    const result = await withTenantSpan(
      "load-snapshot",
      { restaurantId: "r_123", organizationId: "o_456" },
      async () => 42,
    );
    expect(result).toBe(42);
  });

  it("re-raises errors from the wrapped function", async () => {
    await expect(
      withTenantSpan(
        "load-snapshot",
        { restaurantId: "r_123" },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");
  });

  it("accepts optional organizationId", async () => {
    // Just exercises the branch that conditionally sets the attribute —
    // no throw is the success criterion.
    await expect(
      withTenantSpan("noop", { restaurantId: "r_only" }, async () => undefined),
    ).resolves.toBeUndefined();
  });

  it("attribute key constants are stable", () => {
    // Pinned literals — dashboards filter on these exact strings.
    expect(IEDORA_RESTAURANT_ID).toBe("tenant.restaurant_id");
    expect(IEDORA_ORGANIZATION_ID).toBe("tenant.organization_id");
  });
});
