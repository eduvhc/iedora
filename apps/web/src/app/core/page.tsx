import { redirect } from 'next/navigation'
import { getSession } from '@iedora/product-core'
import { APP_URL, signInUrl } from '@iedora/brand'

/**
 * Root of the `core` product. If signed in, bounce to the menu app —
 * core has no surface of its own beyond auth + admin. If not signed
 * in, land on the sign-in page (absolute URL via `signInUrl()` so the
 * redirect works both under the host-rewritten prod path and the
 * path-prefixed local-dev URL).
 */
export default async function CoreHome() {
  const session = await getSession()
  if (session?.user) {
    redirect(APP_URL)
  }
  redirect(signInUrl())
}
