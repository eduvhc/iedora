import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import * as schema from './schema'

/**
 * Better Auth hashes incoming OAuth-client secrets with SHA-256 + base64url
 * (no padding) before storing. We have to mirror the algorithm exactly —
 * otherwise pre-seeded trusted clients fail every token-endpoint exchange
 * with "invalid client" on a string comparison the consumer can't see.
 *
 * Source: genkan/scripts/migrate.mjs (kept in sync via a copy here).
 */
export function hashClientSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('base64url')
}

/**
 * UPSERT a trusted client row directly into `oauth_client`. The
 * `oauthProvider` plugin reads these rows on every authorize/token request;
 * tests seed them up front so the OAuth handshake works without ever
 * touching the dynamic-registration endpoint.
 *
 * Mirrors the row shape genkan's production migrate.mjs writes.
 */
export async function upsertTrustedClient(
  db: ReturnType<typeof import('drizzle-orm/pglite').drizzle<typeof schema>>,
  opts: {
    clientId: string
    clientSecret: string
    redirectUris: string[]
    /** Pinned scope set — must be a subset of oauth-provider's `scopes` list. */
    scopes?: string[]
  },
): Promise<void> {
  const scopes = opts.scopes ?? [
    'openid',
    'profile',
    'email',
    'offline_access',
    'menu',
    'org:read',
    'org:admin',
  ]
  const row = {
    id: `tc_${opts.clientId}`,
    clientId: opts.clientId,
    clientSecret: hashClientSecret(opts.clientSecret),
    name: opts.clientId,
    redirectUris: opts.redirectUris,
    scopes,
    skipConsent: true,
    disabled: false,
    public: false,
    requirePKCE: true,
    tokenEndpointAuthMethod: 'client_secret_basic',
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    subjectType: 'public',
    type: 'web',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  // Drizzle's pg dialect supports `.onConflictDoUpdate`; PGLite implements
  // the same `ON CONFLICT` clause via the wasm postgres engine.
  await db
    .insert(schema.oauthClient)
    .values(row)
    .onConflictDoUpdate({
      target: schema.oauthClient.clientId,
      set: {
        clientSecret: row.clientSecret,
        redirectUris: row.redirectUris,
        skipConsent: true,
        updatedAt: new Date(),
      },
    })
}

/**
 * Seed a pre-granted oauth_consent row so the trusted-client OAuth flow
 * skips the interactive consent page and goes straight to issuance. Used by
 * `handle.seed.grant({ ... })`.
 */
export async function upsertOAuthConsent(
  db: ReturnType<typeof import('drizzle-orm/pglite').drizzle<typeof schema>>,
  opts: { userId: string; clientId: string; scopes: string[] },
): Promise<{ consentId: string }> {
  const id = `consent_${opts.userId}_${opts.clientId}`
  // Find existing first, then insert or update — Drizzle's onConflictDoUpdate
  // needs a unique constraint, but oauth_consent has none on (userId,clientId).
  const existing = await db
    .select({ id: schema.oauthConsent.id })
    .from(schema.oauthConsent)
    .where(eq(schema.oauthConsent.id, id))
    .limit(1)

  const now = new Date()
  if (existing.length === 0) {
    await db.insert(schema.oauthConsent).values({
      id,
      clientId: opts.clientId,
      userId: opts.userId,
      scopes: opts.scopes,
      createdAt: now,
      updatedAt: now,
    })
  } else {
    await db
      .update(schema.oauthConsent)
      .set({ scopes: opts.scopes, updatedAt: now })
      .where(eq(schema.oauthConsent.id, id))
  }
  return { consentId: id }
}

/**
 * Cryptographically random secret used as the default `authSecret` when the
 * caller doesn't supply one. 32 bytes is the Better Auth minimum and matches
 * the production env-var requirement.
 */
export function defaultAuthSecret(): string {
  return randomBytes(32).toString('base64url')
}
