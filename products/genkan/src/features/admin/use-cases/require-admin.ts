import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/features/auth'

/**
 * Platform-admin DAL guard. Every /admin page calls this at the top of its
 * async Server Component. The contract:
 *
 *   - no session                → redirect to /login?return_to=<currentPath>
 *   - signed in but not admin   → notFound() (we deliberately don't 403 so
 *                                 the admin surface doesn't leak to leaked
 *                                 cookies / drive-by curl)
 *   - admin                     → returns the session
 *
 * `role` is set out-of-band on the `user` row (flip the column to "admin"
 * by hand). No self-promotion path exists by design — see
 * `src/features/admin/README.md`.
 */
export async function requireAdmin(returnTo?: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    const dest = returnTo ?? '/admin'
    redirect(`/login?return_to=${encodeURIComponent(dest)}`)
  }
  const role = (session.user as { role?: string | null }).role
  if (role !== 'admin') {
    notFound()
  }
  return session
}
