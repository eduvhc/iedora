import { AsyncLocalStorage } from "node:async_hooks";

import type { TenantAttrs } from "./tenant";

/**
 * Tenant attribution carried on an AsyncLocalStorage store. Modeled on
 * Trigger.dev's DatasourceAttributeSpanProcessor pattern
 * (apps/webapp/app/v3/tracer.server.ts) — an entrypoint sets the tenant
 * once, then every span created inside that block gets the attribute
 * stamped automatically via TenantContextSpanProcessor.
 *
 * Why AsyncLocalStorage instead of OTel's Context API: the OTel API
 * ships a NoopContextManager by default, which does NOT propagate
 * values until @vercel/otel installs AsyncLocalStorageContextManager
 * at register time. In tests we deliberately don't register
 * (NODE_ENV=test short-circuits), so an OTel-Context-based
 * implementation would silently no-op in every Vitest run — and we'd
 * only catch the bug in staging.
 *
 * ALS sidesteps all of that: same propagation semantics
 * (Node's async_hooks), works without OTel setup, works the same in
 * tests and prod. The SpanProcessor reads from the same ALS in
 * onStart — it does NOT need access to the OTel parent Context.
 *
 * Edge runtime: AsyncLocalStorage is Node-only. We're already gated to
 * NEXT_RUNTIME='nodejs' in every consumer's instrumentation.ts, so this
 * is safe. If a future product runs on Edge, we'll need an alternative
 * (or accept that tenancy stamping doesn't work there).
 */

const tenantStorage = new AsyncLocalStorage<TenantAttrs>();

/**
 * Ergonomic facade for the common case: set tenant on the active scope
 * and run `fn` inside it. All spans created inside `fn` — including
 * ones deep inside Drizzle adapters that have no idea what tenant they
 * belong to — get `tenant.restaurant_id` / `tenant.organization_id`
 * stamped on by TenantContextSpanProcessor.
 *
 *   // In requireRestaurantAccess, after the auth check:
 *   return tenantContext.run({ restaurantId, tenantId }, () =>
 *     loadRestaurantSnapshot(slug),
 *   )
 *
 * `fn` may be sync or async; the return type is forwarded as-is. The
 * scope is only active inside `fn` — it does NOT leak to siblings.
 *
 * Nested `run()` shadows the outer tenant for the inner block, then
 * restores the outer tenant on return (standard ALS semantics).
 */
export const tenantContext = {
  /**
   * Set tenant on the active scope and run `fn` inside it. Returns
   * whatever `fn` returns (Promise or value). The scope is only active
   * inside `fn` — outer code after the call sees the previous tenant
   * (or undefined).
   */
  run<T>(attrs: TenantAttrs, fn: () => T): T {
    return tenantStorage.run(attrs, fn);
  },

  /**
   * Set tenant on the current async chain WITHOUT a callback. The store
   * persists through every subsequent async hop in the same execution
   * — perfect for the "set once at the auth boundary, propagate through
   * the rest of the request" pattern used by `requireRestaurantAccess`.
   *
   *   export async function requireRestaurantAccess(...) {
   *     // ... auth check ...
   *     tenantContext.enterWith({ restaurantId, tenantId })
   *     return { session, tenantId, restaurantId }
   *   }
   *
   * Returns the previous store (or undefined) so callers can manually
   * restore it later if they need to. In practice, restoration is
   * unnecessary: Next.js spawns each request in its own ALS root, so
   * `enterWith` in one request can never leak into another.
   *
   * Use this OVER `run` when the entrypoint returns a value the caller
   * needs to consume — wrapping the entire request in `run(...)` would
   * require an inversion-of-control rewrite of every route handler.
   */
  enterWith(attrs: TenantAttrs): TenantAttrs | undefined {
    const previous = tenantStorage.getStore();
    tenantStorage.enterWith(attrs);
    return previous;
  },

  /**
   * Read tenant from the currently-active scope. Returns undefined if
   * no `run` or `enterWith` is in flight. Tests and diagnostics;
   * production code rarely needs this — the span processor handles
   * the common case.
   */
  get(): TenantAttrs | undefined {
    return tenantStorage.getStore();
  },

  /**
   * Internal — exposed so TenantContextSpanProcessor can read the store
   * during onStart without having to re-import the singleton. NOT part
   * of the public API; callers should use `.get()` / `.run()` / `.enterWith()`.
   */
  _store: tenantStorage,
} as const;
