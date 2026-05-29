/**
 * Auth slice ports — the narrow surface backed by better-auth + Drizzle.
 *
 * Identity (sessions, users, orgs, memberships) lives in the `@iedora/auth`
 * `core` schema; restaurant ownership lives in the menu DB. The gateway
 * unifies the two so use-cases speak in domain terms (Session + tenant
 * restaurants) instead of two separate libraries.
 */

/**
 * The session shape consumed by the rest of the menu app.
 *
 * Source: better-auth's `auth.api.getSession()` plus the organization
 * plugin's `activeOrganizationId`. Translated by `adapters/drizzle.ts`.
 *
 * `role` is the cross-tenant scalar (`'iedora-admin'`, `'iedora-support'`,
 * or `null` for tenants). Per-org permissions are evaluated at call time
 * via `requireScope()`, NOT through a flat list on the session.
 */
export type Session = {
  user: {
    id: string
    email: string
    name: string
    role: string | null
  }
  session: {
    id: string
    activeOrganizationId: string | null
  }
}

/**
 * The gateway. One method per atomic read; no Drizzle / better-auth /
 * Next types leak past the interface so adapters can be swapped (e.g. a
 * PGLite fake in tests).
 */
export interface AuthGateway {
  /** Decoded session or null when not signed in / expired / tampered. */
  getSession(): Promise<Session | null>

  /** Look up a menu restaurant by id, scoped to a tenant org. */
  findRestaurantByIdInOrg(params: {
    restaurantId: string
    tenantId: string
  }): Promise<{ id: string } | null>

  /** Same, but resolved by URL slug. */
  findRestaurantBySlugInOrg(params: {
    slug: string
    tenantId: string
  }): Promise<{ id: string; name: string; slug: string } | null>
}
