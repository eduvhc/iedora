import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'

/**
 * Better Auth React client. Genkan's own auth pages (sign-in, sign-up,
 * onboarding) use this to call /api/auth/* on this same host. Sibling
 * products import THEIR own client pointed at https://genkan.iedora.com.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
