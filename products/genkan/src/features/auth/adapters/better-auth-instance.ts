import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins/organization'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { db } from '@/shared/db/client'
import * as schema from '@/shared/db/schema'
import { env } from '@/shared/env'

type AuthDb = PgDatabase<PgQueryResultHKT, typeof schema>

/**
 * Every model Better Auth touches at runtime, given Genkan's plugin set.
 * Exported so tests can assert completeness against a known-good list — if
 * you enable a Better Auth plugin or storage option that adds a new model,
 * register it here AND mirror it on `BA_MODELS` so the integration test
 * catches the wiring gap before it ships.
 */
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
 */
export function makeAuth(database: AuthDb) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: BA_MODELS,
    }),
    // Every product origin that should be signed-in to this Genkan instance.
    // Driven by the TRUSTED_ORIGINS env var so adding a new product is config,
    // not a code change.
    trustedOrigins: env.TRUSTED_ORIGINS,
    emailAndPassword: {
      enabled: true,
    },
    rateLimit: {
      enabled: process.env.DISABLE_AUTH_RATE_LIMIT !== 'true',
      storage: 'database',
    },
    advanced: {
      // Share the auth cookie across every iedora.com subdomain so a user
      // signed in at genkan.iedora.com is signed in at menu.iedora.com and any
      // future <product>.iedora.com automatically. Local dev leaves
      // COOKIE_DOMAIN blank so the cookie stays host-only on localhost.
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
      // Better Auth 1.6.11 flipped the verification default; we don't ship
      // email verification yet so leaving the flag at the new default would
      // silently reject every invite. Flip when the email-sender lands.
      organization({ requireEmailVerificationOnInvitation: false }),
    ],
  })
}

export const auth = makeAuth(db)

export type Session = typeof auth.$Infer.Session
