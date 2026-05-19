import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Pinned regression test for the genkan "too many redirects" loop.
 *
 * Real-world scenario that triggered the report: during Cloudflare Access
 * bootstrap (issue #13), `DEFAULT_RETURN_TO` was set to `obs.iedora.com`
 * — which sits BEHIND Cloudflare Access in front of genkan. After every
 * sign-in, genkan's root page redirected to obs, which redirected back
 * to genkan for the OIDC handshake, which redirected to obs, which
 * redirected to genkan, until the browser gave up with
 * `ERR_TOO_MANY_REDIRECTS`.
 *
 * The fix (post-auth-redirect.ts + page.tsx) introduces an anti-self-
 * redirect guard: if the resolved target's origin matches genkan's own,
 * we return null and render the landing instead. This test exercises
 * every shape of the loop scenario.
 *
 * The module mocks `@/shared/env` per-test rather than relying on the
 * real env file — keeps the test hermetic and lets us drive different
 * env combinations.
 */

// `server-only` is imported transitively by safe-return-to via env; in
// Vitest we neutralize it so the import resolves.
vi.mock('server-only', () => ({}))

async function importWithEnv(env: {
  BETTER_AUTH_URL: string
  DEFAULT_RETURN_TO: string
  TRUSTED_ORIGINS: string[]
}) {
  vi.resetModules()
  vi.doMock('@/shared/env', () => ({ env }))
  return await import('./post-auth-redirect')
}

afterEach(() => {
  vi.doUnmock('@/shared/env')
  vi.restoreAllMocks()
})

describe('postAuthRedirectTarget — anti-loop contract', () => {
  describe('the original bug (DEFAULT_RETURN_TO points at genkan)', () => {
    let mod: Awaited<ReturnType<typeof importWithEnv>>

    beforeEach(async () => {
      // Worst-case misconfiguration: someone set DEFAULT_RETURN_TO to a
      // path on genkan itself (e.g. https://genkan.iedora.com/profile)
      // — pre-fix this would loop forever.
      mod = await importWithEnv({
        BETTER_AUTH_URL: 'https://genkan.iedora.com',
        DEFAULT_RETURN_TO: 'https://genkan.iedora.com/profile',
        TRUSTED_ORIGINS: [
          'https://genkan.iedora.com',
          'https://menu.iedora.com',
        ],
      })
    })

    it('returns null (do not redirect) when no return_to is present and DEFAULT_RETURN_TO is genkan-origin', () => {
      // Pre-fix: would redirect to DEFAULT_RETURN_TO → loop.
      // Post-fix: returns null → page renders, no loop.
      const target = mod.postAuthRedirectTarget({
        rawReturnTo: undefined,
        ownOrigin: 'https://genkan.iedora.com',
      })
      expect(target).toBeNull()
    })

    it("returns null when raw return_to is also a genkan-origin URL", () => {
      // CF Access bounces users to genkan/oauth2/authorize?... — that's
      // a genkan-origin URL. Once they're signed in we shouldn't bounce
      // them back to it from the LANDING (the authorize endpoint will
      // run its own logic when reached directly from CF Access).
      const target = mod.postAuthRedirectTarget({
        rawReturnTo: 'https://genkan.iedora.com/oauth2/authorize?client_id=x',
        ownOrigin: 'https://genkan.iedora.com',
      })
      expect(target).toBeNull()
    })

    it('returns the trusted external URL when return_to points off-genkan', () => {
      // Even with misconfigured DEFAULT_RETURN_TO, an explicit return_to
      // to a trusted product (menu) overrides and points away from
      // genkan — no loop.
      const target = mod.postAuthRedirectTarget({
        rawReturnTo: 'https://menu.iedora.com/dashboard',
        ownOrigin: 'https://genkan.iedora.com',
      })
      expect(target).toBe('https://menu.iedora.com/dashboard')
    })
  })

  describe('happy-path config (DEFAULT_RETURN_TO points at menu)', () => {
    let mod: Awaited<ReturnType<typeof importWithEnv>>

    beforeEach(async () => {
      mod = await importWithEnv({
        BETTER_AUTH_URL: 'https://genkan.iedora.com',
        DEFAULT_RETURN_TO: 'https://menu.iedora.com/dashboard',
        TRUSTED_ORIGINS: [
          'https://genkan.iedora.com',
          'https://menu.iedora.com',
        ],
      })
    })

    it('returns DEFAULT_RETURN_TO when no return_to is present', () => {
      const target = mod.postAuthRedirectTarget({
        rawReturnTo: undefined,
        ownOrigin: 'https://genkan.iedora.com',
      })
      expect(target).toBe('https://menu.iedora.com/dashboard')
    })

    it('returns the explicit return_to when trusted and off-origin', () => {
      const target = mod.postAuthRedirectTarget({
        rawReturnTo: 'https://menu.iedora.com/r/some-restaurant',
        ownOrigin: 'https://genkan.iedora.com',
      })
      expect(target).toBe('https://menu.iedora.com/r/some-restaurant')
    })

    it('rejects an untrusted absolute return_to and falls back to DEFAULT_RETURN_TO', () => {
      // Open-redirect defence: an attacker's return_to=evil.example must
      // not bounce the user there. resolveSafeReturnTo returns
      // DEFAULT_RETURN_TO; postAuthRedirectTarget forwards it (different
      // origin → not null).
      const target = mod.postAuthRedirectTarget({
        rawReturnTo: 'https://evil.example.com/phish',
        ownOrigin: 'https://genkan.iedora.com',
      })
      expect(target).toBe('https://menu.iedora.com/dashboard')
    })

    it('returns null when return_to is a genkan-origin URL (anti-self-redirect)', () => {
      // Even with the happy DEFAULT_RETURN_TO config, an explicit
      // return_to to genkan must not redirect us back to ourselves.
      const target = mod.postAuthRedirectTarget({
        rawReturnTo: 'https://genkan.iedora.com/profile',
        ownOrigin: 'https://genkan.iedora.com',
      })
      expect(target).toBeNull()
    })

    it('rejects protocol-relative and slash-backslash bypass attempts', () => {
      // `//evil.example` and `/\\evil.example` are classic open-redirect
      // smuggling. Should not be accepted as relative paths.
      const protocolRelative = mod.postAuthRedirectTarget({
        rawReturnTo: '//evil.example/phish',
        ownOrigin: 'https://genkan.iedora.com',
      })
      const slashBackslash = mod.postAuthRedirectTarget({
        rawReturnTo: '/\\evil.example/phish',
        ownOrigin: 'https://genkan.iedora.com',
      })
      // Both fall through to DEFAULT_RETURN_TO (= menu, off-origin) so
      // the result is "go to menu" — definitely not "go to evil".
      expect(protocolRelative).toBe('https://menu.iedora.com/dashboard')
      expect(slashBackslash).toBe('https://menu.iedora.com/dashboard')
    })
  })

  describe('relative return_to resolves against BETTER_AUTH_URL', () => {
    // Pre-fix: relative paths resolved against DEFAULT_RETURN_TO (menu's
    // URL), turning `/admin/users/x` on a genkan page into a menu URL
    // that 404s. Post-fix: resolved against BETTER_AUTH_URL (genkan).
    // Because the result is genkan-origin, the anti-loop guard kicks in
    // and we return null → the caller renders the page they're already
    // on. This is the correct behaviour for the "already authenticated,
    // landing redirected with relative return_to" path.

    let mod: Awaited<ReturnType<typeof importWithEnv>>

    beforeEach(async () => {
      mod = await importWithEnv({
        BETTER_AUTH_URL: 'https://genkan.iedora.com',
        DEFAULT_RETURN_TO: 'https://menu.iedora.com/dashboard',
        TRUSTED_ORIGINS: [
          'https://genkan.iedora.com',
          'https://menu.iedora.com',
        ],
      })
    })

    it('resolves /profile against BETTER_AUTH_URL (genkan) and returns null (anti-loop)', () => {
      // Per the safe-return-to fix, `/profile` → `https://genkan.iedora.com/profile`.
      // Then anti-loop sees same origin and returns null.
      const target = mod.postAuthRedirectTarget({
        rawReturnTo: '/profile',
        ownOrigin: 'https://genkan.iedora.com',
      })
      expect(target).toBeNull()
    })

    it('would never accidentally cross-product to menu (pre-fix regression)', () => {
      // The old behaviour turned `/profile` into `https://menu.iedora.com/profile`.
      // Pin that this never happens.
      const target = mod.postAuthRedirectTarget({
        rawReturnTo: '/profile',
        ownOrigin: 'https://genkan.iedora.com',
      })
      expect(target).not.toBe('https://menu.iedora.com/profile')
    })
  })
})
