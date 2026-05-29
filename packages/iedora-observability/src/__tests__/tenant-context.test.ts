import { describe, expect, it } from "vitest";

import { tenantContext } from "../tenant-context";

/**
 * tenantContext is the mechanism that lets entrypoints (e.g.
 * `requireRestaurantAccess`) declare tenant attribution once and have
 * every downstream span pick it up via TenantContextSpanProcessor.
 *
 * The implementation is AsyncLocalStorage-backed so it works the same
 * in tests (no SDK registered) as it does in production. These tests
 * exercise the propagation contract directly — no OTel SDK needed.
 */
describe("tenantContext", () => {
  it("returns undefined when no tenant is set", () => {
    expect(tenantContext.get()).toBeUndefined();
  });

  it("propagates tenant inside run() to synchronous callbacks", () => {
    const captured = tenantContext.run(
      { restaurantId: "r_sync", tenantId: "o_sync" },
      () => tenantContext.get(),
    );
    expect(captured).toEqual({
      restaurantId: "r_sync",
      tenantId: "o_sync",
    });
  });

  it("propagates tenant inside run() to async callbacks across await points", async () => {
    // AsyncLocalStorage propagates through await chains via Node's
    // async_hooks. Pinned here because a future refactor that uses
    // plain closures (e.g. a Map keyed by something brittle) would
    // silently break this — and an entire feature's spans would lose
    // tenant attribution without any test failure.
    const captured = await tenantContext.run(
      { restaurantId: "r_async" },
      async () => {
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 1));
        return tenantContext.get();
      },
    );
    expect(captured).toEqual({ restaurantId: "r_async" });
  });

  it("forwards the callback's return value as-is", () => {
    const result = tenantContext.run(
      { restaurantId: "r_ret" },
      () => ({ ok: true, n: 42 }),
    );
    expect(result).toEqual({ ok: true, n: 42 });
  });

  it("does not leak tenant outside run()", () => {
    tenantContext.run({ restaurantId: "r_inner" }, () => {
      expect(tenantContext.get()).toEqual({ restaurantId: "r_inner" });
    });
    // After the .run returns, the active scope has no tenant again.
    expect(tenantContext.get()).toBeUndefined();
  });

  it("inner run() overrides outer run() inside its block, then restores on exit", () => {
    tenantContext.run({ restaurantId: "r_outer" }, () => {
      tenantContext.run({ restaurantId: "r_inner" }, () => {
        expect(tenantContext.get()).toEqual({ restaurantId: "r_inner" });
      });
      // After inner returns, outer is restored — standard ALS semantics.
      expect(tenantContext.get()).toEqual({ restaurantId: "r_outer" });
    });
  });

  it("enterWith sets tenant for the rest of the async chain without a callback", async () => {
    // The pattern requireRestaurantAccess uses: function returns the
    // tenant attribution AND seeds the ALS store. The caller (route
    // handler) then sees the tenant in every downstream call.
    async function authBoundary() {
      tenantContext.enterWith({ restaurantId: "r_entered" });
      return { restaurantId: "r_entered" };
    }
    async function downstream() {
      // Simulates a Drizzle adapter call that has no idea it's in a
      // tenant scope. The span processor would stamp tenant.* on
      // spans started here.
      return tenantContext.get();
    }
    await tenantContext.run({ restaurantId: "r_outer" }, async () => {
      await authBoundary();
      const observed = await downstream();
      expect(observed).toEqual({ restaurantId: "r_entered" });
    });
  });

  it("enterWith returns the previous tenant so callers can restore manually", () => {
    tenantContext.run({ restaurantId: "r_outer" }, () => {
      const previous = tenantContext.enterWith({ restaurantId: "r_new" });
      expect(previous).toEqual({ restaurantId: "r_outer" });
      expect(tenantContext.get()).toEqual({ restaurantId: "r_new" });
    });
  });

  it("isolates concurrent run() calls — parallel calls do not bleed into each other", async () => {
    // The bug we're guarding against: a global mutable variable
    // pretending to be context. Two concurrent requests each in their
    // own .run scope must observe their own tenant, not the other's.
    const [a, b] = await Promise.all([
      tenantContext.run({ restaurantId: "r_A" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return tenantContext.get();
      }),
      tenantContext.run({ restaurantId: "r_B" }, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return tenantContext.get();
      }),
    ]);
    expect(a).toEqual({ restaurantId: "r_A" });
    expect(b).toEqual({ restaurantId: "r_B" });
  });
});
