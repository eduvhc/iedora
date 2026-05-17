import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/shared/db/schema'
import { makeTestDb, type TestDb } from '@/shared/testing/pglite'
import type { Session } from '@/features/auth/adapters/better-auth-instance'
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
 * the fields the use-cases actually read (`user.id`, `session.activeOrganizationId`);
 * everything else gets a minimal stub plus an `as unknown as Session` cast.
 */
function makeSession(opts: {
  userId: string
  activeOrganizationId: string | null
}): Session {
  return {
    user: { id: opts.userId },
    session: { activeOrganizationId: opts.activeOrganizationId },
  } as unknown as Session
}

/**
 * Hand-rolled `AuthGateway` whose lookups run against the test PGLite db,
 * so we exercise real Drizzle queries (and therefore real Postgres semantics)
 * without standing up Better Auth.
 */
function makeGatewayFor(
  testDb: TestDb,
  session: Session | null,
): AuthGateway {
  return {
    async getSession() {
      return session
    },
    async findEarliestOrgMembership(userId) {
      const rows = await testDb.db
        .select({ organizationId: schema.member.organizationId })
        .from(schema.member)
        .where(eq(schema.member.userId, userId))
        .orderBy(schema.member.createdAt)
        .limit(1)
      return rows[0] ?? null
    },
    async findRestaurantByIdInOrg({ restaurantId, organizationId, userId }) {
      const rows = await testDb.db
        .select({ id: schema.restaurant.id })
        .from(schema.restaurant)
        .innerJoin(
          schema.member,
          eq(schema.member.organizationId, schema.restaurant.organizationId),
        )
        .where(
          and(
            eq(schema.restaurant.id, restaurantId),
            eq(schema.restaurant.organizationId, organizationId),
            eq(schema.member.userId, userId),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    },
    async findRestaurantBySlugInOrg({ slug, organizationId, userId }) {
      const rows = await testDb.db
        .select({
          id: schema.restaurant.id,
          name: schema.restaurant.name,
          slug: schema.restaurant.slug,
        })
        .from(schema.restaurant)
        .innerJoin(
          schema.member,
          eq(schema.member.organizationId, schema.restaurant.organizationId),
        )
        .where(
          and(
            eq(schema.restaurant.slug, slug),
            eq(schema.restaurant.organizationId, organizationId),
            eq(schema.member.userId, userId),
          ),
        )
        .limit(1)
      return rows[0] ?? null
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
    const session = makeSession({ userId: 'u1', activeOrganizationId: 'o1' })
    const gw: AuthGateway = {
      getSession: async () => session,
    } as unknown as AuthGateway

    await expect(verifySession(gw)).resolves.toBe(session)
  })
})

describe('requireRestaurantAccess', () => {
  beforeEach(async () => {
    // Seed the canonical happy-path: user u1 is a member of org o1 which
    // owns restaurant r1. Every column not covered by a schema default is
    // populated explicitly so we don't depend on Postgres defaults.
    await t.db.insert(schema.user).values({
      id: 'u1',
      email: 'a@b.test',
      name: 'A',
      emailVerified: true,
    })
    await t.db.insert(schema.organization).values({
      id: 'o1',
      name: 'Org One',
      slug: 'org-one',
      plan: 'free',
      createdAt: new Date(),
    })
    await t.db.insert(schema.member).values({
      id: 'm1',
      userId: 'u1',
      organizationId: 'o1',
      role: 'admin',
      createdAt: new Date(),
    })
    await t.db.insert(schema.restaurant).values({
      id: 'r1',
      organizationId: 'o1',
      slug: 'sushi',
      name: 'Sushi',
    })
  })

  it('returns the restaurant context when the caller is a member of the owning org', async () => {
    const session = makeSession({ userId: 'u1', activeOrganizationId: 'o1' })
    const gw = makeGatewayFor(t, session)

    const result = await requireRestaurantAccess(gw, 'r1')

    expect(result.restaurantId).toBe('r1')
    expect(result.organizationId).toBe('o1')
    expect(result.session).toBe(session)
  })

  it('redirects to /dashboard when the restaurant belongs to a different org', async () => {
    // Second org + restaurant; u1 is NOT a member of o2.
    await t.db.insert(schema.organization).values({
      id: 'o2',
      name: 'Org Two',
      slug: 'org-two',
      plan: 'free',
      createdAt: new Date(),
    })
    await t.db.insert(schema.restaurant).values({
      id: 'r2',
      organizationId: 'o2',
      slug: 'pizza',
      name: 'Pizza',
    })

    const session = makeSession({ userId: 'u1', activeOrganizationId: 'o1' })
    const gw = makeGatewayFor(t, session)

    await expect(requireRestaurantAccess(gw, 'r2')).rejects.toThrow(
      '__REDIRECT__:/dashboard',
    )
  })

  it('falls back to earliest membership when session has no activeOrganizationId', async () => {
    // No activeOrganizationId — exercises the get-effective-organization-id
    // path that queries `findEarliestOrgMembership`.
    const session = makeSession({ userId: 'u1', activeOrganizationId: null })
    const gw = makeGatewayFor(t, session)

    const result = await requireRestaurantAccess(gw, 'r1')

    expect(result.organizationId).toBe('o1')
    expect(result.restaurantId).toBe('r1')
  })

  it('redirects to /onboarding when the user has no org memberships', async () => {
    await t.db.insert(schema.user).values({
      id: 'u2',
      email: 'lonely@b.test',
      name: 'Lonely',
      emailVerified: true,
    })
    const session = makeSession({ userId: 'u2', activeOrganizationId: null })
    const gw = makeGatewayFor(t, session)

    await expect(requireRestaurantAccess(gw, 'r1')).rejects.toThrow(
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
 *
 * We exercise the exact shape Better Auth uses (see
 * `node_modules/better-auth/dist/api/rate-limiter/index.mjs::createDatabaseStorageWrapper`).
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
