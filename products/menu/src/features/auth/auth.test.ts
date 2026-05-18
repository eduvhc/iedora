import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/shared/db/schema'
import { makeTestDb, type TestDb } from '@/shared/testing/pglite'
import type { IdentityGateway, Organization } from '@/features/identity'
import type { Session } from './adapters/better-auth-instance'
import type { AuthGateway } from './ports'
import { verifySession } from './use-cases/verify-session'
import { requireRestaurantAccess } from './use-cases/require-restaurant-access'

// The use-cases call next/navigation's `redirect()` / `notFound()`, which
// only work inside a real Next request scope. In Vitest we replace them with
// throws so the assertion side of the test can detect the redirect path.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`__REDIRECT__:${path}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('__NOT_FOUND__')
  }),
}))

// `server-only` would throw at import-time outside a Next server context;
// in Vitest we neutralize it.
vi.mock('server-only', () => ({}))

let t: TestDb

beforeEach(async () => {
  t = await makeTestDb()
})

afterEach(async () => {
  await t.cleanup()
})

/**
 * Build a `Session` shape matching what Better Auth returns. We only need
 * the user.id field; everything else gets a minimal stub plus an
 * `as unknown as Session` cast.
 */
function makeSession(opts: { userId: string }): Session {
  return {
    user: { id: opts.userId },
    session: {},
  } as unknown as Session
}

/**
 * Hand-rolled `AuthGateway` whose restaurant lookups run against the test
 * PGLite db, so we exercise real Drizzle queries (and therefore real
 * Postgres semantics) without standing up Better Auth.
 */
function makeAuthGateway(
  testDb: TestDb,
  session: Session | null,
): AuthGateway {
  return {
    async getSession() {
      return session
    },
    async findRestaurantByIdInOrg({ restaurantId, organizationId }) {
      const rows = await testDb.db
        .select({ id: schema.restaurant.id })
        .from(schema.restaurant)
        .where(
          and(
            eq(schema.restaurant.id, restaurantId),
            eq(schema.restaurant.organizationId, organizationId),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    },
    async findRestaurantBySlugInOrg({ slug, organizationId }) {
      const rows = await testDb.db
        .select({
          id: schema.restaurant.id,
          name: schema.restaurant.name,
          slug: schema.restaurant.slug,
        })
        .from(schema.restaurant)
        .where(
          and(
            eq(schema.restaurant.slug, slug),
            eq(schema.restaurant.organizationId, organizationId),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    },
  }
}

/**
 * Fake IdentityGateway. In production this calls Genkan over HTTP; in
 * tests we hand it a static list keyed by userId so the use-cases can
 * exercise the "user belongs to org" join purely against the membership
 * map the test set up.
 */
function makeIdentityGateway(
  byUser: Record<string, Organization[]>,
): IdentityGateway {
  return {
    async listOrganizations(userId) {
      return byUser[userId] ?? []
    },
    async createOrganization() {
      throw new Error('not used in these tests')
    },
    async setActiveOrganization() {
      return true
    },
  }
}

describe('verifySession', () => {
  it("redirects to Genkan's /login when there is no session", async () => {
    const gw: AuthGateway = {
      getSession: async () => null,
    } as unknown as AuthGateway

    // Genkan is the SSO entryway — every unauthenticated request bounces to
    // its /login. Dev uses :3001, prod uses https://genkan.iedora.com.
    await expect(verifySession(gw)).rejects.toThrow(/__REDIRECT__:.*\/login$/)
  })

  it('returns the session when present', async () => {
    const session = makeSession({ userId: 'u1' })
    const gw: AuthGateway = {
      getSession: async () => session,
    } as unknown as AuthGateway

    await expect(verifySession(gw)).resolves.toBe(session)
  })
})

describe('requireRestaurantAccess', () => {
  beforeEach(async () => {
    // Seed the canonical happy-path: restaurant r1 belongs to org o1.
    // Genkan would tell us "u1 is a member of o1" via the IdentityGateway
    // — we wire that mapping in each test below.
    await t.db.insert(schema.restaurant).values({
      id: 'r1',
      organizationId: 'o1',
      slug: 'sushi',
      name: 'Sushi',
    })
  })

  it('returns the restaurant context when the caller is a member of the owning org', async () => {
    const session = makeSession({ userId: 'u1' })
    const auth = makeAuthGateway(t, session)
    const identity = makeIdentityGateway({
      u1: [{ id: 'o1', name: 'Org One', slug: 'org-one' }],
    })

    const result = await requireRestaurantAccess(auth, identity, 'r1')

    expect(result.restaurantId).toBe('r1')
    expect(result.organizationId).toBe('o1')
    expect(result.session).toBe(session)
  })

  it('redirects to /dashboard when the restaurant belongs to a different org', async () => {
    // Second restaurant in o2 — u1 is NOT a member of o2 (identity returns
    // only o1), so the effective org resolves to o1 and r2 won't be found
    // under it.
    await t.db.insert(schema.restaurant).values({
      id: 'r2',
      organizationId: 'o2',
      slug: 'pizza',
      name: 'Pizza',
    })

    const session = makeSession({ userId: 'u1' })
    const auth = makeAuthGateway(t, session)
    const identity = makeIdentityGateway({
      u1: [{ id: 'o1', name: 'Org One', slug: 'org-one' }],
    })

    await expect(requireRestaurantAccess(auth, identity, 'r2')).rejects.toThrow(
      '__REDIRECT__:/dashboard',
    )
  })

  it('falls back to the first organization Genkan returns when picking the active org', async () => {
    const session = makeSession({ userId: 'u1' })
    const auth = makeAuthGateway(t, session)
    // Multiple orgs — picks the first (Genkan's response order).
    const identity = makeIdentityGateway({
      u1: [
        { id: 'o1', name: 'Org One', slug: 'org-one' },
        { id: 'o2', name: 'Org Two', slug: 'org-two' },
      ],
    })

    const result = await requireRestaurantAccess(auth, identity, 'r1')

    expect(result.organizationId).toBe('o1')
    expect(result.restaurantId).toBe('r1')
  })

  it('redirects to /onboarding when the user has no orgs on Genkan', async () => {
    const session = makeSession({ userId: 'u2' })
    const auth = makeAuthGateway(t, session)
    const identity = makeIdentityGateway({}) // u2 → no orgs

    await expect(requireRestaurantAccess(auth, identity, 'r1')).rejects.toThrow(
      '__REDIRECT__:/onboarding',
    )
  })
})

/**
 * Better Auth `rateLimit.storage: 'database'` writes into the `rateLimit`
 * table at runtime — one row per (key) with running count + lastRequest
 * timestamp. Schema generated by `bun run auth:generate`.
 *
 * This test exists to catch a silent regression: if someone removes the
 * `rateLimit` table from the schema (or renames a column), Better Auth's
 * runtime call would crash on the *first* auth request that hits the
 * limiter — which would be missed by every test except this one.
 */
describe('Better Auth rateLimit table — schema contract', () => {
  it('accepts the row shape Better Auth writes (key + count + lastRequest)', async () => {
    const now = Date.now()
    await t.db.insert(schema.rateLimit).values({
      id: 'r-1',
      key: 'login:127.0.0.1',
      count: 1,
      lastRequest: now,
    })

    const [row] = await t.db
      .select()
      .from(schema.rateLimit)
      .where(eq(schema.rateLimit.key, 'login:127.0.0.1'))
      .limit(1)

    expect(row?.count).toBe(1)
    expect(row?.lastRequest).toBe(now)
  })

  it('enforces unique constraint on `key` so increments stay collapsed to one row', async () => {
    await t.db.insert(schema.rateLimit).values({
      id: 'r-a',
      key: 'shared-key',
      count: 1,
      lastRequest: 1000,
    })
    await expect(
      t.db.insert(schema.rateLimit).values({
        id: 'r-b',
        key: 'shared-key',
        count: 2,
        lastRequest: 2000,
      }),
    ).rejects.toThrow()
  })

  it('round-trips a realistic Better Auth lifecycle (create → update)', async () => {
    // Mirrors createDatabaseStorageWrapper.set when _update is false then true.
    await t.db.insert(schema.rateLimit).values({
      id: 'r-2',
      key: 'auth:rl:x',
      count: 1,
      lastRequest: 1000,
    })
    await t.db
      .update(schema.rateLimit)
      .set({ count: 2, lastRequest: 2000 })
      .where(eq(schema.rateLimit.key, 'auth:rl:x'))

    const [row] = await t.db
      .select()
      .from(schema.rateLimit)
      .where(eq(schema.rateLimit.key, 'auth:rl:x'))
      .limit(1)

    expect(row?.count).toBe(2)
    expect(row?.lastRequest).toBe(2000)
  })
})
