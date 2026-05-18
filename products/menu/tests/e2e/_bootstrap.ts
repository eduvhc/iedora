/**
 * E2E bootstrap.
 *
 * Boots the in-process auth-testkit (Better Auth + PGLite + OAuth provider)
 * and mounts a tiny HTTP shim in front of it. Listens on a FIXED port
 * (`SHIM_PORT`, default 4444) so menu's `webServer.env` can point at it
 * deterministically without a chicken-and-egg dance.
 *
 * Why the shim:
 *   Menu's `genkanHttpIdentity` adapter calls genkan with `Authorization:
 *   Bearer <accessToken>` against `/api/identity/organization/{list,create,
 *   set-active}` — first-party identity routes on genkan that verify the
 *   bearer locally (JWKS or opaque-token lookup) and re-issue the action
 *   as the verified user. The auth-testkit is bare Better Auth and doesn't
 *   ship those routes, so this shim emulates them for tests:
 *     - `/list`        → read `member ⋈ organization` from testkit's PGLite
 *                        for the user resolved from the JWT's `sub` claim.
 *     - `/create`      → call `handle.auth.api.createOrganization({ body:
 *                        { userId, name, slug } })` — the plugin's "system
 *                        action" path that bypasses the session check.
 *     - `/set-active`  → no-op success.
 *   Everything else proxies untouched.
 *
 * Started as a Playwright `webServer` entry; `bun` runs this file directly
 * (Bun resolves the testkit's TypeScript exports without a build step;
 * Node would need `--experimental-strip-types` and even then can't handle
 * the testkit's `import { drizzle } from 'drizzle-orm/pglite'` chain).
 */
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { signTestToken, startTestGenkan } from '@iedora/auth-testkit'
import * as schema from '../../../../packages/iedora-auth-testkit/src/schema'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const HANDLE_FILE = resolve(__dirname, '.testkit.json')

const SHIM_PORT = Number(process.env.SHIM_PORT ?? 4444)
const MENU_BASE_URL = process.env.MENU_BASE_URL ?? 'http://localhost:3000'

const CLIENT = {
  client_id: 'menu',
  client_secret: 'menu-secret',
  redirect_uris: [`${MENU_BASE_URL}/api/auth/oauth2/callback/genkan`],
}

/**
 * Decode the `sub` claim from an OAuth-issued bearer JWT. We don't verify
 * the signature in the shim — every request originates from menu's server
 * inside the same test on a loopback port nothing else can reach.
 */
function userIdFromBearer(authHeader?: string | string[]): string | null {
  const h = Array.isArray(authHeader) ? authHeader[0] : authHeader
  if (!h || !h.startsWith('Bearer ')) return null
  const token = h.slice('Bearer '.length).trim()
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf8'),
    ) as { sub?: unknown }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

async function main(): Promise<void> {
  const handle = await startTestGenkan({ clients: [CLIENT] })

  const shim = http.createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost`)
      const path = url.pathname

      try {
        // ── Test-only helpers (out-of-band; never exposed to menu) ────────
        if (path === '/_test/sign-token' && req.method === 'POST') {
          const body = await readBody(req)
          const parsed = body
            ? (JSON.parse(body) as { userId?: string; scopes?: string[] })
            : {}
          if (!parsed.userId) return send(res, 400, { error: 'missing userId' })
          try {
            const token = await signTestToken({
              handle,
              userId: parsed.userId,
              scopes: parsed.scopes,
            })
            return send(res, 200, { token })
          } catch (err) {
            return send(res, 500, { error: String(err) })
          }
        }

        if (path === '/_test/seed-member' && req.method === 'POST') {
          const body = await readBody(req)
          const parsed = body
            ? (JSON.parse(body) as {
                orgId?: string
                userId?: string
                role?: 'owner' | 'admin' | 'member'
              })
            : {}
          if (!parsed.orgId || !parsed.userId) {
            return send(res, 400, { error: 'missing orgId or userId' })
          }
          try {
            await handle.seed.member({
              orgId: parsed.orgId,
              userId: parsed.userId,
              role: parsed.role ?? 'member',
            })
            return send(res, 200, { ok: true })
          } catch (err) {
            return send(res, 500, { error: String(err) })
          }
        }

        if (path === '/_test/find-user-id' && req.method === 'GET') {
          const email = url.searchParams.get('email')
          if (!email) return send(res, 400, { error: 'missing email' })
          const rows = await handle.db
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(eq(schema.user.email, email))
            .limit(1)
          return send(res, 200, { id: rows[0]?.id ?? null })
        }

        // Reset the testkit's identity DB between tests. Called by the
        // `resetMenu` fixture's afterEach hook so each spec starts with
        // a clean genkan as well as a clean menu. Wipes everything
        // user-scoped (users, sessions, orgs, members, invitations,
        // grants, refresh + access tokens) but KEEPS the oauth_client
        // table — the menu client row is seeded once at boot via
        // startTestGenkan({ clients: [...] }) and the testkit doesn't
        // expose a re-seed API for it.
        // Order matters for FKs: children first, parents last.
        if (path === '/_test/reset' && req.method === 'POST') {
          const tables = [
            schema.oauthAccessToken,
            schema.oauthRefreshToken,
            schema.oauthConsent,
            schema.verification,
            schema.invitation,
            schema.member,
            schema.organization,
            schema.session,
            schema.account,
            schema.user,
          ]
          for (const t of tables) {
            await handle.db.delete(t).execute()
          }
          return send(res, 200, { ok: true })
        }

        // ── Bearer-adapted endpoints ──────────────────────────────────────
        if (
          path === '/api/identity/organization/list' &&
          req.method === 'GET'
        ) {
          const userId = userIdFromBearer(req.headers.authorization)
          if (!userId) return send(res, 401, { error: 'invalid_token' })
          const rows = await handle.db
            .select({
              id: schema.organization.id,
              name: schema.organization.name,
              slug: schema.organization.slug,
              logo: schema.organization.logo,
              createdAt: schema.organization.createdAt,
              metadata: schema.organization.metadata,
              role: schema.member.role,
            })
            .from(schema.member)
            .innerJoin(
              schema.organization,
              eq(schema.member.organizationId, schema.organization.id),
            )
            .where(eq(schema.member.userId, userId))
          return send(res, 200, rows)
        }

        if (
          path === '/api/identity/organization/create' &&
          req.method === 'POST'
        ) {
          const userId = userIdFromBearer(req.headers.authorization)
          if (!userId) return send(res, 401, { error: 'invalid_token' })
          const body = await readBody(req)
          const parsed = body
            ? (JSON.parse(body) as { name?: string; slug?: string })
            : {}
          try {
            const result = await handle.auth.api.createOrganization({
              body: {
                name: parsed.name ?? '',
                slug: parsed.slug ?? '',
                userId,
              },
            })
            return send(res, 200, result)
          } catch (err) {
            console.error('[shim] organization/create failed', err)
            return send(res, 400, { error: String(err) })
          }
        }

        if (
          path === '/api/identity/organization/set-active' &&
          req.method === 'POST'
        ) {
          // Plugin requires a session for this; menu's setActiveOrganization
          // only checks for a non-null response, so a 200 is enough for the
          // production code path to "succeed" in tests. The active-org
          // selection effectively comes from `listOrganizations[0]` after
          // this — see `getEffectiveOrganizationId`.
          const userId = userIdFromBearer(req.headers.authorization)
          if (!userId) return send(res, 401, { error: 'invalid_token' })
          return send(res, 200, { ok: true })
        }

        // ── Everything else: proxy to the testkit ─────────────────────────
        const target = `${handle.url}${req.url ?? '/'}`
        const upstreamHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(req.headers)) {
          if (k === 'host' || k === 'content-length') continue
          if (typeof v === 'string') upstreamHeaders[k] = v
          else if (Array.isArray(v)) upstreamHeaders[k] = v.join(', ')
        }
        // Better Auth's CSRF check rejects state-changing requests whose
        // Origin isn't in `trustedOrigins`. The testkit only trusts its
        // own base URL; we rewrite Origin so proxied requests pass the
        // check transparently.
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          upstreamHeaders.origin = handle.url
        }
        let body: string | undefined
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          body = await readBody(req)
        }
        const upstream = await fetch(target, {
          method: req.method,
          headers: upstreamHeaders,
          body: body ?? undefined,
          redirect: 'manual',
        })
        res.statusCode = upstream.status
        upstream.headers.forEach((v, k) => {
          if (k === 'transfer-encoding' || k === 'content-encoding') return
          res.setHeader(k, v)
        })
        const buf = Buffer.from(await upstream.arrayBuffer())
        res.end(buf)
      } catch (err) {
        console.error('[shim] handler error', err)
        try {
          send(res, 500, { error: String(err) })
        } catch {
          /* socket may already be closed */
        }
      }
    },
  )

  await new Promise<void>((resolveListen, reject) => {
    shim.once('error', reject)
    shim.listen(SHIM_PORT, '127.0.0.1', () => resolveListen())
  })
  const shimUrl = `http://127.0.0.1:${SHIM_PORT}`

  writeFileSync(
    HANDLE_FILE,
    JSON.stringify(
      {
        url: shimUrl,
        testkitUrl: handle.url,
        clientId: CLIENT.client_id,
        clientSecret: CLIENT.client_secret,
      },
      null,
      2,
    ),
  )

  // Health endpoint so Playwright's webServer.url check passes immediately.
  console.log(`[bootstrap] testkit ${handle.url}  shim ${shimUrl}`)

  const shutdown = async (): Promise<void> => {
    try {
      shim.close()
      await handle.stop()
      if (existsSync(HANDLE_FILE)) unlinkSync(HANDLE_FILE)
    } catch (err) {
      console.error('[bootstrap] shutdown error', err)
    }
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  process.on('disconnect', shutdown)
}

main().catch((err: unknown) => {
  console.error('[bootstrap] fatal', err)
  process.exit(1)
})
