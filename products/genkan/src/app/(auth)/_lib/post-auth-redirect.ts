import { resolveSafeReturnTo } from './safe-return-to'

/**
 * Where a freshly-authenticated user should land after touching genkan.
 *
 * Returns:
 *   - the safe redirect URL when there's somewhere meaningful to send them
 *     that isn't genkan's own origin, OR
 *   - `null` to indicate "render the current page" (stay on genkan).
 *
 * The `null` branch is the anti-loop guard: if the resolved target's
 * origin matches genkan's own (BETTER_AUTH_URL), redirecting would loop
 * back here next request. That happened in real configs when
 * `DEFAULT_RETURN_TO` accidentally pointed at obs.iedora.com (which sits
 * behind Cloudflare Access in front of genkan) — the bounce returned the
 * user to genkan repeatedly.
 *
 * Pure function. Takes everything via args so tests can drive the env
 * mismatch scenarios without Next's `redirect()` runtime.
 */
export function postAuthRedirectTarget(opts: {
  rawReturnTo: string | null | undefined
  ownOrigin: string
}): string | null {
  const target = resolveSafeReturnTo(opts.rawReturnTo)
  if (sameOrigin(target, opts.ownOrigin)) return null
  return target
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}
