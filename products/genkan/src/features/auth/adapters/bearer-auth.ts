import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client'
import { db } from '@/shared/db/client'
import { oauthAccessToken, user as userTable } from '@/shared/db/schema'
import { auth } from './better-auth-instance'

/**
 * Minimal JWT-payload shape we care about. The `verifyAccessToken` action
 * returns `jose.JWTPayload`, but `jose` is a transitive dep of Better Auth
 * (not pinned in genkan's package.json), so we narrow to the subset of
 * fields the bearer-auth path inspects.
 */
type JwtPayloadLike = {
  sub?: unknown
  scope?: unknown
}

/**
 * Bearer-token authentication for genkan's first-party API surfaces (e.g.
 * `/api/identity/*`). Better Auth's organization plugin gates its built-in
 * routes on a session COOKIE — useless for server-to-server traffic from
 * sibling products (menu) that hold an OAuth access token, not a cookie.
 *
 * This module bridges the gap. It accepts EITHER:
 *   - a signed JWT access token (verified via JWKS through
 *     `oauthProviderResourceClient.verifyAccessToken`) — the path used by
 *     the e2e auth-testkit, which mints raw JWTs through `signJWT`;
 *   - an opaque access token (verified by direct DB lookup of
 *     `oauth_access_token` with the SHA-256 hash key Better Auth uses to
 *     store it) — the production path, since menu's OAuth client doesn't
 *     request a `resource` and so receives opaque tokens.
 *
 * Both paths return a normalised `{ userId, scopes }` envelope; calling
 * routes then enforce scope-per-action (e.g. `org:read` for list,
 * `org:admin` for create/set-active).
 */

export type BearerAuth = {
  userId: string
  scopes: string[]
}

export type BearerAuthError =
  | { ok: false; status: 401; error: string }
  | { ok: false; status: 403; error: string }

export type BearerAuthResult = ({ ok: true } & BearerAuth) | BearerAuthError

/**
 * Replicates oauth-provider's `defaultHasher`: SHA-256 over the raw token,
 * base64url (no padding). The plugin stores `oauth_access_token.token`
 * under this hash when `storeTokens` is `'hashed'` (the default).
 */
function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

/**
 * `Authorization: Bearer <token>` extractor. Returns the raw token or null
 * (no header / wrong scheme / empty token).
 */
export function readBearer(request: Request): string | null {
  const h = request.headers.get('authorization')
  if (!h || !h.toLowerCase().startsWith('bearer ')) return null
  const token = h.slice('bearer '.length).trim()
  return token.length > 0 ? token : null
}

/**
 * Cheap structural check — three base64url segments separated by dots.
 * Distinguishes JWT-shaped tokens from opaque tokens without crypto cost.
 */
function looksLikeJwt(token: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  return parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p) && p.length > 0)
}

/**
 * JWT path: verify locally against the JWKS that genkan publishes at
 * `/api/auth/jwks`. Audience defaults to genkan's `baseURL` (the
 * `signJWT`/`signTestToken` default) when the caller didn't override it.
 */
async function verifyJwtBearer(token: string): Promise<JwtPayloadLike | null> {
  try {
    // Cast — Better Auth's `Auth` generic carries user-additional-field
    // metadata that gets duplicated across the `.bun/` hoist layout, so
    // the structural identity check between the auth instance type and
    // the resource-client's `T extends Auth` constraint fails. Functionally
    // we just want the no-auth-overrides branch, where the resource client
    // pulls `baseURL`/`jwksUrl` from the auth options.
    const resourceClient = oauthProviderResourceClient(
      auth as unknown as Parameters<typeof oauthProviderResourceClient>[0],
    )
    const { verifyAccessToken } = resourceClient.getActions()
    // `audience` is required by the resource-client API. We pin it to the
    // auth server's baseURL — the value `signJWT` (and the testkit's
    // `signTestToken`) bake into `aud` by default. Production tokens that
    // come via the OAuth code flow take this path only when the client
    // requested a `resource=` parameter (today: never), so the JWT branch
    // is functionally only exercised by tests and is harmless in prod.
    const baseURL = auth.options.baseURL
    if (!baseURL) return null
    return (await verifyAccessToken(token, {
      verifyOptions: { audience: baseURL },
    })) as JwtPayloadLike
  } catch {
    return null
  }
}

/**
 * Opaque path: look up the token in `oauth_access_token` by its hashed
 * key, reject expired rows, and load the associated user.
 *
 * Mirrors `validateOpaqueAccessToken` in @better-auth/oauth-provider, but
 * does it via Drizzle so we don't have to construct a fake endpoint ctx to
 * call `auth.api.oauth2Introspect` (which would also require pinning the
 * caller's client_secret on this code path).
 */
async function verifyOpaqueBearer(token: string): Promise<BearerAuth | null> {
  const hashed = hashOpaqueToken(token)
  const now = new Date()
  const rows = await db
    .select({
      userId: oauthAccessToken.userId,
      scopes: oauthAccessToken.scopes,
    })
    .from(oauthAccessToken)
    .where(
      and(
        eq(oauthAccessToken.token, hashed),
        gt(oauthAccessToken.expiresAt, now),
      ),
    )
    .limit(1)
  const row = rows[0]
  if (!row?.userId) return null

  // Sanity: the user still exists (cascade should keep this true, but a
  // missing user means we shouldn't claim a valid auth).
  const userRows = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, row.userId))
    .limit(1)
  if (!userRows[0]) return null

  return { userId: row.userId, scopes: row.scopes ?? [] }
}

function payloadScopes(payload: JwtPayloadLike): string[] {
  const raw = payload.scope
  if (typeof raw === 'string') return raw.split(/\s+/).filter(Boolean)
  if (Array.isArray(raw))
    return raw.filter((s): s is string => typeof s === 'string')
  return []
}

/**
 * Authenticate a request via bearer token. Returns `{ ok: true, userId,
 * scopes }` on success, or `{ ok: false, status, error }` on failure.
 *
 * `requiredScope`, if passed, is enforced AFTER authentication — a token
 * that authenticates but lacks the scope yields a 403, never a 401, so
 * the client can distinguish "log in again" from "ask for more access".
 */
export async function authenticateBearer(
  request: Request,
  opts: { requiredScope?: string } = {},
): Promise<BearerAuthResult> {
  const token = readBearer(request)
  if (!token) {
    return { ok: false, status: 401, error: 'missing_bearer_token' }
  }

  let resolved: BearerAuth | null = null
  if (looksLikeJwt(token)) {
    const payload = await verifyJwtBearer(token)
    if (payload && typeof payload.sub === 'string') {
      resolved = { userId: payload.sub, scopes: payloadScopes(payload) }
    }
  }
  if (!resolved) {
    resolved = await verifyOpaqueBearer(token)
  }
  if (!resolved) {
    return { ok: false, status: 401, error: 'invalid_token' }
  }

  if (opts.requiredScope && !resolved.scopes.includes(opts.requiredScope)) {
    return {
      ok: false,
      status: 403,
      error: `insufficient_scope:${opts.requiredScope}`,
    }
  }

  return { ok: true, userId: resolved.userId, scopes: resolved.scopes }
}
