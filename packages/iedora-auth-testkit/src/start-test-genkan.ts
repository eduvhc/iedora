import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { toNodeHandler } from 'better-auth/node'
import { admin } from 'better-auth/plugins/admin'
import { jwt } from 'better-auth/plugins/jwt'
import { organization } from 'better-auth/plugins/organization'
import { oauthProvider } from '@better-auth/oauth-provider'
import * as schema from './schema'
import { pushGenkanSchema } from './push-schema'
import {
  defaultAuthSecret,
  upsertOAuthConsent,
  upsertTrustedClient,
} from './seed'

export type TestClient = {
  client_id: string
  client_secret: string
  redirect_uris: string[]
}

export type TestGenkanOptions = {
  /**
   * Pre-registered trusted OAuth clients. Each entry is upserted into
   * `oauth_client` with `skipConsent=true` so the consumer's authorization
   * code flow doesn't require an interactive consent page. Same effect as
   * genkan's production `TRUSTED_CLIENTS` env var, just typed.
   */
  clients?: TestClient[]
  /** Port to listen on. Default: 0 (OS-assigned random free port). */
  port?: number
  /**
   * Origin used to build the issuer URL. Default: `http://localhost:${port}`
   * derived after the server starts listening.
   */
  baseUrl?: string
  /**
   * Shared HMAC signing secret (Better Auth's BETTER_AUTH_SECRET equivalent).
   * Default: cryptographically random 32-byte base64url string.
   */
  authSecret?: string
}

export type TestGenkanSeeds = {
  user(opts: {
    name: string
    email: string
    password: string
    role?: 'user' | 'admin'
  }): Promise<{ id: string; email: string }>
  organization(opts: {
    name: string
    slug: string
    ownerId: string
  }): Promise<{ id: string; slug: string }>
  member(opts: {
    orgId: string
    userId: string
    role: 'owner' | 'admin' | 'member'
  }): Promise<void>
  grant(opts: {
    userId: string
    clientId: string
    scopes: string[]
  }): Promise<{ consentId: string }>
}

export type TestGenkanHandle = {
  /** Base URL where the test server is listening, e.g. http://localhost:54321 */
  url: string
  /** Discovery URL — pass this to a consumer's generic-oauth client config. */
  discoveryUrl: string
  /** Shut down: stops the HTTP server and closes the PGLite handle. */
  stop(): Promise<void>
  /** Convenience seed helpers. */
  seed: TestGenkanSeeds
  /**
   * The underlying Better Auth instance — only exported so `signTestToken`
   * can call `auth.api.signJWT` without a second factory. Treat as opaque.
   */
  readonly auth: ReturnType<typeof makeAuthForTest>
  /** Direct DB access — only exported so the tests in this package can
   *  introspect rows. Consumers should never reach in here directly. */
  readonly db: ReturnType<typeof drizzle<typeof schema>>
}

/**
 * Internal factory — mirrors genkan's production `makeAuth` but with every
 * env-dependent flag inlined as a parameter. Keeping this here (rather than
 * importing from genkan) means the testkit can run without any of genkan's
 * server-only modules loaded.
 */
export function makeAuthForTest(args: {
  database: ReturnType<typeof drizzle<typeof schema>>
  baseURL: string
  secret: string
  trustedClients: TestClient[]
}) {
  return betterAuth({
    baseURL: args.baseURL,
    secret: args.secret,
    database: drizzleAdapter(args.database, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
        rateLimit: schema.rateLimit,
        jwks: schema.jwks,
        oauthClient: schema.oauthClient,
        oauthAccessToken: schema.oauthAccessToken,
        oauthRefreshToken: schema.oauthRefreshToken,
        oauthConsent: schema.oauthConsent,
      },
    }),
    // Tests run against an in-memory DB — rate limiting just adds noise.
    rateLimit: { enabled: false },
    trustedOrigins: [args.baseURL],
    emailAndPassword: {
      enabled: true,
      // Verification flow needs an email sender; tests skip it.
      requireEmailVerification: false,
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'user',
          input: false,
        },
      },
    },
    plugins: [
      organization({ requireEmailVerificationOnInvitation: false }),
      admin(),
      jwt(),
      oauthProvider({
        loginPage: '/login',
        consentPage: '/consent',
        scopes: [
          'openid',
          'profile',
          'email',
          'offline_access',
          'menu',
          'org:read',
          'org:admin',
        ],
        cachedTrustedClients: new Set(args.trustedClients.map((c) => c.client_id)),
        signup: { page: '/signup' },
        getAdditionalUserInfoClaim: async (
          user: { id: string; role?: string },
          _scopes: string[],
        ) => {
          // Tests don't need the org-claim fan-out; keep it minimal to avoid
          // dragging in genkan's organization use-case (which would couple
          // the testkit to genkan's full source tree).
          const claims: Record<string, unknown> = {}
          const u = user as typeof user & { role?: string }
          if (u.role) claims.role = u.role
          return claims
        },
      }),
    ],
  })
}

/**
 * Boot an in-process Better Auth + OAuth-provider instance for tests.
 *
 * Lifecycle:
 *   1. Spin up PGLite (in-memory).
 *   2. Apply genkan's `drizzle/*.sql` migrations.
 *   3. Configure Better Auth with the same plugin set genkan runs in prod.
 *   4. Upsert any trusted clients passed in `opts.clients`.
 *   5. Bind a `node:http` server on `opts.port` (default: random free port).
 *   6. Return a handle: `url`, `discoveryUrl`, `stop()`, `seed.*`.
 *
 * The instance is fully isolated — each call returns a fresh DB and a fresh
 * server. Tests can run in parallel without sharing state.
 */
export async function startTestGenkan(
  opts: TestGenkanOptions = {},
): Promise<TestGenkanHandle> {
  const client = new PGlite()
  await pushGenkanSchema(client)
  const db = drizzle(client, { schema, casing: 'snake_case' })

  // The HTTP listener needs a real port before we can derive the baseURL
  // for Better Auth (which is needed at construct-time for issuer claims).
  // The chicken-and-egg gets resolved by listening FIRST on the requested
  // port, then constructing the auth instance with the resolved URL.
  const tempHandler = (
    _req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void => {
    res.statusCode = 503
    res.end('test-genkan: not ready')
  }
  const server = http.createServer(tempHandler)

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port ?? 0, '127.0.0.1', () => resolve())
  })

  const addr = server.address() as AddressInfo
  const port = addr.port
  const baseURL = opts.baseUrl ?? `http://localhost:${port}`
  const secret = opts.authSecret ?? defaultAuthSecret()
  const clients = opts.clients ?? []

  const auth = makeAuthForTest({
    database: db,
    baseURL,
    secret,
    trustedClients: clients,
  })

  // Now swap in the real handler. `toNodeHandler` accepts Better Auth's
  // auth object directly. It mounts every Better Auth endpoint under the
  // default basePath `/api/auth/*` — so JWKS lives at `/api/auth/jwks`,
  // the OAuth authorize/token endpoints at `/api/auth/oauth2/*`, etc.
  const realHandler = toNodeHandler(auth)
  server.removeListener('request', tempHandler)
  server.on('request', (req, res) => {
    void route(req, res)
  })

  /**
   * Top-level router. Three responsibilities, all sharing one server:
   *
   *   /up                                          → health probe
   *   /.well-known/openid-configuration[suffix]    → OIDC discovery
   *   /.well-known/oauth-authorization-server[suf] → OAuth 2.0 discovery
   *   /api/auth/...                                → Better Auth handler
   *
   * The `.well-known/*` routes need bespoke handling because Better Auth
   * marks `getOpenIdConfig` / `getOAuthServerConfig` as SERVER_ONLY — i.e.
   * not auto-mounted on the public HTTP handler. Genkan's production code
   * mounts them via Next.js route files (see
   * products/genkan/src/app/.well-known/...). We replicate that here.
   */
  async function route(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = req.url ?? '/'
    if (url === '/up') {
      res.statusCode = 200
      res.setHeader('content-type', 'text/plain')
      res.end('ok')
      return
    }
    // RFC 8414 path-suffix variants — strip the basePath suffix so a single
    // matcher catches both forms.
    const wellKnown = url.split('?')[0]
    if (
      wellKnown === '/.well-known/openid-configuration' ||
      wellKnown === '/.well-known/openid-configuration/api/auth'
    ) {
      const config = await auth.api.getOpenIdConfig()
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(config))
      return
    }
    if (
      wellKnown === '/.well-known/oauth-authorization-server' ||
      wellKnown === '/.well-known/oauth-authorization-server/api/auth'
    ) {
      const config = await auth.api.getOAuthServerConfig()
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(config))
      return
    }
    void realHandler(req, res)
  }

  // Seed trusted clients now that the DB is up and the schema is applied.
  for (const c of clients) {
    await upsertTrustedClient(db, {
      clientId: c.client_id,
      clientSecret: c.client_secret,
      redirectUris: c.redirect_uris,
    })
  }

  const seed: TestGenkanSeeds = {
    async user({ name, email, password, role }) {
      // Use Better Auth's signup endpoint so the same hooks fire as in
      // production (account row, password hashing, etc).
      const result = (await auth.api.signUpEmail({
        body: { name, email, password },
      })) as { user: { id: string; email: string } }
      const userId = result.user.id
      if (role === 'admin') {
        await db
          .update(schema.user)
          .set({ role: 'admin' })
          .where(eq(schema.user.id, userId))
      }
      return { id: userId, email: result.user.email }
    },
    async organization({ name, slug, ownerId }) {
      const result = (await auth.api.createOrganization({
        body: { name, slug, userId: ownerId },
      })) as { id: string; slug: string } | null
      if (!result) {
        throw new Error(
          `[auth-testkit] createOrganization returned null for slug=${slug}. ` +
            `Better Auth swallowed the error — check the plugin config.`,
        )
      }
      return { id: result.id, slug: result.slug }
    },
    async member({ orgId, userId, role }) {
      await auth.api.addMember({
        body: { organizationId: orgId, userId, role },
      })
    },
    async grant({ userId, clientId, scopes }) {
      return upsertOAuthConsent(db, { userId, clientId, scopes })
    },
  }

  const url = baseURL
  const discoveryUrl = `${baseURL}/.well-known/openid-configuration`

  let stopped = false
  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    await client.close()
  }

  return { url, discoveryUrl, stop, seed, auth, db }
}
