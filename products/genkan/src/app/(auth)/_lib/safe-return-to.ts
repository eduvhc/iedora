import { env } from '@/shared/env'

/**
 * Resolve a `return_to` query param to a safe redirect target.
 *
 * Rules:
 *   - Absolute URL whose origin is in TRUSTED_ORIGINS → keep as-is.
 *   - Any other absolute URL → reject (fall back to DEFAULT_RETURN_TO).
 *   - Relative path starting with `/` and NOT `//` (which is protocol-
 *     relative) → resolved against `BETTER_AUTH_URL` (genkan's OWN origin).
 *     Relative paths on a genkan page reference genkan routes — turning
 *     `/profile` into `https://menu.iedora.com/profile` (the old behaviour,
 *     resolving against DEFAULT_RETURN_TO) silently sent users to a 404 on
 *     the wrong product.
 *   - Anything else, including null → DEFAULT_RETURN_TO.
 *
 * Runs on the server (env access). Pass the result to the client form as
 * a plain string prop so the browser never sees the allowlist.
 */
export function resolveSafeReturnTo(raw: string | null | undefined): string {
  const fallback = env.DEFAULT_RETURN_TO
  if (!raw) return fallback

  // Absolute URL
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      const allowed = env.TRUSTED_ORIGINS
      if (allowed.includes(url.origin)) return url.toString()
    } catch {
      // fall through to fallback
    }
    return fallback
  }

  // Same-origin relative path. Resolved against genkan's OWN origin
  // (BETTER_AUTH_URL) so `/profile`, `/admin/users/...`, `/oauth2/authorize`
  // map to the right product. Old behaviour resolved against fallback
  // (DEFAULT_RETURN_TO = menu) and quietly cross-products links.
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) {
    try {
      return new URL(raw, env.BETTER_AUTH_URL).toString()
    } catch {
      return fallback
    }
  }

  return fallback
}
