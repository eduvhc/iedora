import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getCoreDb } from './db'
import { schema } from './schema'
import type { Scope } from './scopes'

/**
 * Per-tenant membership primitives. Authorisation reads
 * `tenant_member.scopes` directly — no role indirection in the data
 * layer. UI may render labels via `detectPreset()` (in `./permissions`)
 * but the persisted truth is the scope array.
 */

const { tenantMember } = schema

export type TenantMember = {
  id: string
  tenantId: string
  userId: string
  scopes: Scope[]
  createdAt: Date
}

/**
 * Add (or replace) a user's membership in a tenant. Idempotent on
 * `(tenantId, userId)` — re-calling with a new `scopes` array UPDATES
 * the existing row instead of inserting. UI grant flows use this.
 *
 * Set `scopes` to an empty array if the caller wants to keep the
 * membership row but with no powers; remove the membership outright
 * via `removeMember`.
 */
export async function upsertMember(input: {
  tenantId: string
  userId: string
  scopes: readonly Scope[]
}): Promise<TenantMember> {
  const db = getCoreDb()
  const now = new Date()
  const [row] = await db
    .insert(tenantMember)
    .values({
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      scopes: [...input.scopes],
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [tenantMember.tenantId, tenantMember.userId],
      set: { scopes: [...input.scopes] },
    })
    .returning()
  if (!row) throw new Error('[iedora/auth] tenant_member upsert returned no row')
  return row
}

/** Remove a user from a tenant. No-op if the membership doesn't exist. */
export async function removeMember(input: {
  tenantId: string
  userId: string
}): Promise<void> {
  const db = getCoreDb()
  await db
    .delete(tenantMember)
    .where(
      and(
        eq(tenantMember.tenantId, input.tenantId),
        eq(tenantMember.userId, input.userId),
      ),
    )
}

/** Every member of a tenant. */
export async function listMembers(tenantId: string): Promise<TenantMember[]> {
  const db = getCoreDb()
  return db
    .select()
    .from(tenantMember)
    .where(eq(tenantMember.tenantId, tenantId))
}

/**
 * Read the scopes the user holds inside a specific tenant. Returns
 * `null` (not `[]`) when there's no membership row — caller decides
 * whether "no member" should fall back to anonymous behaviour or
 * outright deny.
 */
export async function getMemberScopes(input: {
  tenantId: string
  userId: string
}): Promise<Scope[] | null> {
  const db = getCoreDb()
  const rows = await db
    .select({ scopes: tenantMember.scopes })
    .from(tenantMember)
    .where(
      and(
        eq(tenantMember.tenantId, input.tenantId),
        eq(tenantMember.userId, input.userId),
      ),
    )
    .limit(1)
  return rows[0]?.scopes ?? null
}
