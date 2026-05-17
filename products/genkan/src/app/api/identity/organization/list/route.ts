import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { authenticateBearer } from '@/features/auth/adapters/bearer-auth'
import { db } from '@/shared/db/client'
import { member, organization } from '@/shared/db/schema'

/**
 * `GET /api/identity/organization/list`
 *
 * Returns the organizations the bearer-token subject is a member of. Used
 * by menu's `IdentityGateway.listOrganizations` so the dashboard DAL can
 * verify a caller's tenant set without holding a genkan session cookie.
 *
 * Required scope: `org:read`.
 */
export async function GET(request: Request): Promise<Response> {
  const authResult = await authenticateBearer(request, {
    requiredScope: 'org:read',
  })
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    )
  }

  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      createdAt: organization.createdAt,
      metadata: organization.metadata,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, authResult.userId))

  return NextResponse.json(rows)
}
