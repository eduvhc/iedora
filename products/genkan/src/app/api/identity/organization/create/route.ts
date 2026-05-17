import { NextResponse } from 'next/server'
import * as z from 'zod'
import { authenticateBearer } from '@/features/auth/adapters/bearer-auth'
import { auth } from '@/features/auth/adapters/better-auth-instance'

const bodySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
})

/**
 * `POST /api/identity/organization/create`
 *
 * Creates an organization on behalf of the bearer-token subject and adds
 * them as the owner. Wraps `auth.api.createOrganization`, which has a
 * documented "system action" path (no session, but `userId` in body) we
 * unlock by NOT forwarding the request headers — Better Auth's organization
 * plugin checks `ctx.request || ctx.headers` first before falling back to
 * `ctx.body.userId`. Passing nothing skips the session lookup.
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

  try {
    const result = await auth.api.createOrganization({
      body: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        userId: authResult.userId,
        // keepCurrentActiveOrganization avoids a spurious cookie write —
        // there's no session in this call path anyway, but the org plugin
        // is defensive about it.
        keepCurrentActiveOrganization: true,
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    // Better Auth surfaces APIError-derived failures with a status + body.
    const status =
      err && typeof err === 'object' && 'status' in err
        ? typeof err.status === 'number'
          ? err.status
          : 400
        : 500
    const message = err instanceof Error ? err.message : 'create_failed'
    return NextResponse.json({ error: message }, { status })
  }
}
