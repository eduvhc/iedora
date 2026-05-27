import { NextRequest, NextResponse } from 'next/server'
import { publicUrl } from '@iedora/product-menu/shared/url'
import { signInUrl } from '@iedora/product-core/url'
import { surfaces, surfaceByHost } from './generated/surfaces'

const protectedPrefixes = ['/menu/dashboard', '/menu/onboarding']

/**
 * better-auth's session cookie name. Used here only as an OPTIMISTIC
 * hint (cookie present ⇒ likely signed in) — the real session lookup
 * happens in the DAL via `auth.api.getSession()`. AGENTS.md hard rule #5.
 */
const SESSION_COOKIE = 'better-auth.session_token'

/**
 * Three jobs in order of precedence:
 *
 *   1. **Host-based rewrites** — for hosts whose surface has a
 *      `rewritePath` (e.g. `iedora.com → /house/*`, `core.iedora.com
 *      → /core/*`). The matched surface comes from the generated
 *      registry at `./generated/surfaces.ts` (single source of truth:
 *      `infra/deploy/cmd/iedora/topology.go`).
 *
 *   2. **Cross-host guard** for namespace paths. Direct visits to
 *      another surface's namespace (`menu.iedora.com/house*`,
 *      `menu.iedora.com/core/*`) 404 — except `localhost` where every
 *      surface keeps its path-based fallback for plain local dev
 *      without `*.localhost` gymnastics.
 *
 *   3. **Optimistic auth gate** for menu's protected prefixes. Real
 *      auth runs in the DAL via `verifySession()`.
 */
export default function proxy(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0] ?? ''
  const path = req.nextUrl.pathname

  const here = surfaceByHost(host)

  // 1. Host-based rewrite for surfaces with a rewritePath set.
  if (here && here.rewritePath) {
    const target = path === '/' ? here.rewritePath : `${here.rewritePath}${path}`
    const url = req.nextUrl.clone()
    url.pathname = target
    return NextResponse.rewrite(url)
  }

  // 2. Cross-host guard — visiting another surface's namespace from
  //    a host that doesn't own it. `localhost` (the dev catch-all)
  //    keeps the path-based fallback so every surface's /<name>/*
  //    works without `*.localhost` /etc/hosts gymnastics.
  for (const s of surfaces) {
    if (!s.rewritePath) continue
    if (here && here.name === s.name) continue
    if (path !== s.rewritePath && !path.startsWith(`${s.rewritePath}/`)) continue
    if (host === 'localhost') continue
    return new NextResponse('Not Found', { status: 404 })
  }

  // 3. Menu's optimistic auth check.
  const isProtected = protectedPrefixes.some((p) => path.startsWith(p))
  if (!isProtected) return NextResponse.next()

  const hasSession = req.cookies.has(SESSION_COOKIE)
  if (!hasSession) {
    // Cross-origin redirect to the core product's sign-in. `next` is an
    // absolute URL on THIS host (built via publicUrl) so after auth the
    // user lands back on the protected route they tried to reach.
    return NextResponse.redirect(signInUrl(publicUrl(path).toString()))
  }

  return NextResponse.next()
}

export const config = {
  // `up` is excluded alongside `api` — both serve every host without
  // rewrite (infra plumbing: better-auth catch-all + container
  // healthcheck). Routes for them live at apps/web/src/app/{api,up}/.
  matcher: ['/((?!api|up|_next/static|_next/image|.*\\.png$).*)'],
}
