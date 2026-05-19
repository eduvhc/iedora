import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MetaStrip, Wordmark } from '@iedora/design-system'
import { auth } from '@/features/auth/adapters/better-auth-instance'
import { ImpersonationBanner } from './impersonation-banner'

/**
 * Best-effort reconstruction of the current request path so we can pass it
 * as `?return_to=` to /login. `headers()` ships these on Vercel + Next 16,
 * with reasonable fallbacks elsewhere. If none are present we send the
 * user to `/login` without a return_to and the post-login flow falls back
 * to `DEFAULT_RETURN_TO` — same as the previous behaviour, no regression.
 */
async function currentPathFromHeaders(): Promise<string | undefined> {
  const h = await headers()
  // Next 16 sets `next-url` on RSC requests. Otherwise we walk
  // X-Forwarded-* + referer to reconstruct.
  const nextUrl = h.get('next-url')
  if (nextUrl) return nextUrl
  const forwardedProto = h.get('x-forwarded-proto') ?? 'https'
  const forwardedHost = h.get('x-forwarded-host') ?? h.get('host')
  const referer = h.get('referer')
  if (forwardedHost && referer) {
    try {
      const u = new URL(referer)
      // Trust the referer ONLY when it matches the request host. Random
      // cross-origin referers must not turn into our return_to.
      if (u.host === forwardedHost && u.protocol === `${forwardedProto}:`) {
        return u.pathname + u.search
      }
    } catch {
      // ignore
    }
  }
  return undefined
}

/**
 * Shell for every signed-in page (profile, consent, future settings).
 * Soft check: redirects unauthenticated users to /login with a return_to
 * so they land back here after authenticating. Per-page DAL guards still
 * apply for stricter requirements (admin role, etc.).
 *
 * Padding and gaps scale via clamp() and the spacing tokens; the MetaStrip
 * collapses to a stacked layout on phones (see globals.css `.ds-shell-meta`).
 */
export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    const returnTo = await currentPathFromHeaders()
    if (returnTo) {
      redirect(`/login?return_to=${encodeURIComponent(returnTo)}`)
    }
    redirect('/login')
  }

  return (
    <div
      className="ds-root"
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      {session.session.impersonatedBy ? (
        <ImpersonationBanner email={session.user.email} />
      ) : null}
      <div
        className="ds-shell ds-shell-meta"
        style={{
          maxWidth: 1100,
          paddingTop: 'clamp(var(--s-4), 5vw, var(--s-7))',
        }}
      >
        <MetaStrip
          left={
            <>
              <span>MMXXVI</span>
              <span>Genkan · Identity</span>
            </>
          }
          right={
            <>
              <Link href="/profile">Profile</Link>
              <span aria-hidden="true">·</span>
              <Link href="/api/auth/sign-out">Sign out</Link>
            </>
          }
        />
      </div>

      <main
        className="ds-shell"
        style={{
          maxWidth: 1100,
          flex: 1,
          paddingTop: 'clamp(var(--s-7), 8vw, var(--s-9))',
          paddingBottom: 'clamp(var(--s-8), 10vw, var(--s-10))',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(var(--s-7), 6vw, var(--s-8))',
        }}
      >
        <Link
          href="/profile"
          aria-label="Genkan"
          style={{ textDecoration: 'none' }}
        >
          {/* Genkan owns its own product name on its own pages — the
              parent brand (iedora) shows up in `MMXXVI · Genkan · …`
              on the MetaStrip above, not duplicated as a second wordmark. */}
          <Wordmark word="genkan" variant="inline" className="ds-wordmark--reveal" />
        </Link>
        {children}
      </main>
    </div>
  )
}
