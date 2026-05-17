import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins/organization'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { db } from '@/shared/db/client'
import * as schema from '@/shared/db/schema'
import { env } from '@/shared/env'
import { GENKAN_URL } from '@/shared/brand'

// Generic over the driver — accepts both postgres-js (prod) and PGLite (tests).
type AuthDb = PgDatabase<PgQueryResultHKT, typeof schema>

// Every model Better Auth touches at runtime, given our plugin set:
//   core (email+password) → user, session, account, verification
//   organization plugin   → organization, member, invitation
//   rateLimit.storage='database' → rateLimit
//
// Exported so tests can assert completeness against a known-good list — if
// you enable a Better Auth plugin or storage option that adds a new model,
// register it here AND mirror it on `BA_MODELS` so the integration test
// catches the wiring gap before it ships.
export const BA_MODELS = {
  user: schema.user,
  session: schema.session,
  account: schema.account,
  verification: schema.verification,
  organization: schema.organization,
  member: schema.member,
  invitation: schema.invitation,
  rateLimit: schema.rateLimit,
} as const

/**
 * Factory. Production uses the singleton at the bottom; tests construct
 * their own instance pointed at a PGLite db to exercise the real adapter
 * wiring (e.g. catch "model X not found in schema object" before deploy).
 *
 * Genkan (genkan.iedora.com) is the canonical sign-in surface for the
 * iedora ecosystem; menu reads the session cookie Genkan issues. Both
 * apps share BETTER_AUTH_SECRET and the same Postgres `session` table —
 * what makes the session valid here is identical to what makes it valid
 * in Genkan.
 */
export function makeAuth(database: AuthDb) {
  return betterAuth({
    // Pin baseURL explicitly. Better Auth would derive it from
    // env.BETTER_AUTH_URL anyway, but the explicit value is diff-visible at
    // PR review and makes test fixtures deterministic (tests stub env).
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: BA_MODELS,
    }),
    // Trust menu's own origin AND Genkan — sign-out requests from menu
    // POST through to menu's /api/auth, and Genkan needs to be able to
    // POST cross-origin during the dev-mode sign-in flow.
    trustedOrigins: [env.BETTER_AUTH_URL, GENKAN_URL],
    emailAndPassword: {
      enabled: true,
    },
    // DB-backed rate limit + sessions. We're single-node, so the secondaryStorage
    // pattern (caching across nodes) is redundancy without a payoff. Postgres
    // handles the volume — Better Auth's `rateLimit.storage: 'database'` uses
    // the same Drizzle connection that backs sessions/users/orgs.
    rateLimit: {
      enabled: process.env.DISABLE_AUTH_RATE_LIMIT !== 'true',
      storage: 'database',
    },
    // Trust cloudflared's CF-Connecting-IP only; X-Forwarded-For is spoofable
    // upstream of the tunnel. ipv6Subnet: 64 mitigates CVE-2026-45364 (attackers
    // walking a /64 to evade per-IP throttles).
    advanced: {
      // Share the auth cookie across every iedora.com subdomain so a session
      // issued by Genkan at genkan.iedora.com is recognised at menu.iedora.com
      // (and any future product.iedora.com). MUST match Genkan's setting
      // exactly. Local dev leaves COOKIE_DOMAIN blank so the cookie stays
      // host-only on localhost.
      crossSubDomainCookies: env.COOKIE_DOMAIN
        ? {
            enabled: true,
            domain: env.COOKIE_DOMAIN,
          }
        : undefined,
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
        ipv6Subnet: 64,
      },
    },
    plugins: [
      // Better Auth 1.6.11 flipped this default to `true` as an
      // invitation-takeover CVE fix (basecamp/better-auth#9577). We don't
      // ship email verification yet, so leaving it `true` silently rejects
      // every invite create/accept with EMAIL_VERIFICATION_REQUIRED_*.
      // Flip back on AND wire `emailAndPassword.requireEmailVerification`
      // the day the email-sender integration ships.
      organization({ requireEmailVerificationOnInvitation: false }),
    ],
  })
}

export const auth = makeAuth(db)

export type Session = typeof auth.$Infer.Session
