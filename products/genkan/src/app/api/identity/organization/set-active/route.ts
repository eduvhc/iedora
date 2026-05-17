import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import * as z from 'zod'
import { authenticateBearer } from '@/features/auth/adapters/bearer-auth'
import { db } from '@/shared/db/client'
import { member, session } from '@/shared/db/schema'

const bodySchema = z.object({
  organizationId: z.string().min(1),
})

/**
 * `POST /api/identity/organization/set-active`
 *
 * Sets the bearer subject's active organization. Better Auth's organization
 * plugin gates its built-in `/organization/set-active` on a session
 * (`orgSessionMiddleware` + `requireHeaders: true`) and provides no
 * "system action" override, so we update `session.active_organization_id`
 * directly via drizzle.
 *
 * Membership is verified before the write: a caller can't pin themselves
 * to an org they don't belong to (mirrors the plugin's
 * `adapter.checkMembership` guard). If the user has no session row yet
 * (server-to-server call from menu where the local genkan cookie isn't
 * present) the route still 200s — there's nothing to write, but the
 * caller's effective active org comes from `listOrganizations[0]`
 * downstream and that already works.
 *
 * Required scope: `org:admin`.
 */
export async function POST(request: Request): Promise<Response> {
  const authResult = await authenticateBearer(request, {
    requiredScope: 'org:admin',
  })
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    )
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  // Verify the caller actually belongs to the org before binding it.
  const memberships = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, authResult.userId),
        eq(member.organizationId, parsed.data.organizationId),
      ),
    )
    .limit(1)
  if (memberships.length === 0) {
    return NextResponse.json(
      { error: 'not_a_member' },
      { status: 403 },
    )
  }

  // Pin the active org on the user's most recent session, if one exists.
  // (No session row = server-to-server caller; success is still meaningful
  // because menu derives its own active-org choice client-side.)
  const sessions = await db
    .select({ id: session.id })
    .from(session)
    .where(eq(session.userId, authResult.userId))
    .orderBy(desc(session.updatedAt))
    .limit(1)
  const target = sessions[0]
  if (target) {
    await db
      .update(session)
      .set({ activeOrganizationId: parsed.data.organizationId })
      .where(eq(session.id, target.id))
  }

  return NextResponse.json({
    ok: true,
    activeOrganizationId: parsed.data.organizationId,
  })
}
