import 'server-only'
import { cache } from 'react'
import { betterAuthGateway } from './adapters/better-auth'
import { verifySession as _verifySession } from './use-cases/verify-session'
import { getEffectiveOrganizationId as _getEffectiveOrganizationId } from './use-cases/get-effective-organization-id'
import { requireActiveOrganization as _requireActiveOrganization } from './use-cases/require-active-organization'
import { requireFreshSession as _requireFreshSession } from './use-cases/require-fresh-session'

/**
 * Public API of Genkan's auth slice. These wrappers bind the production
 * AuthGateway and are wrapped in React's `cache()` so a guard called
 * repeatedly during a single render hits the DB once.
 *
 * For unit tests, import the use-case functions directly from
 * `./use-cases/*` and pass a fake `AuthGateway`.
 */
export const verifySession = cache(() => _verifySession(betterAuthGateway))

export const getEffectiveOrganizationId = cache(
  (userId: string, sessionActive: string | null | undefined) =>
    _getEffectiveOrganizationId(betterAuthGateway, userId, sessionActive),
)

export const requireActiveOrganization = cache(() =>
  _requireActiveOrganization(betterAuthGateway),
)

/**
 * Step-up DAL guard for destructive operations. Not wrapped in React's
 * `cache()` because: (1) callers are server actions, not server-component
 * renders, so memoization doesn't help; (2) freshness is time-sensitive
 * and a stale cache hit would be exactly the wrong outcome.
 */
export const requireFreshSession = (options?: {
  maxAgeMin?: number
  returnTo?: string
}) => _requireFreshSession(betterAuthGateway, options)

export type { AuthGateway } from './ports'
export { auth, type Session } from './adapters/better-auth-instance'
