import 'server-only'
import { redirect } from 'next/navigation'
import { GENKAN_URL } from '@/shared/brand'
import type { AuthGateway } from '../ports'

/**
 * Resolves the current session. Redirects to Genkan's /login when the
 * caller is unauthenticated; returns the (non-null) session otherwise.
 *
 * Genkan (genkan.iedora.com) owns sign-in/sign-up UI for the iedora
 * ecosystem; menu is a session consumer. After successful sign-in,
 * Genkan bounces back to its configured DEFAULT_RETURN_TO (menu).
 *
 * The `return_to` query param isn't set here because Next 16 RSC has
 * no first-party way to read the request URL inside a use-case; the
 * proxy at `src/proxy.ts` does the cookie-presence check earlier and
 * can attach a precise return_to. This page-level guard is the
 * defense-in-depth backstop.
 */
export async function verifySession(auth: AuthGateway) {
  const session = await auth.getSession()
  if (!session?.user) {
    redirect(`${GENKAN_URL}/login`)
  }
  return session
}
