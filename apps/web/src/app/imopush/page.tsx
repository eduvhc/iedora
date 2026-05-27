import type { Metadata } from 'next'
import { Wordmark } from '@iedora/design-system'

/**
 * imopush.iedora.com — the imopush product surface. `proxy.ts` rewrites
 * the `imopush.iedora.com` host into `/imopush/*` so the user-visible
 * URL stays clean. Scaffold landing page until the first slice lands.
 */

export const metadata: Metadata = {
  title: 'imopush',
  description: 'TBD — a new iedora product in the making.',
}

export default function ImopushLanding() {
  return (
    <main className="ds-shell" id="top">
      <header className="ds-hero" data-test-id="imopush-hero">
        <span className="ds-eyebrow">
          <span className="ds-eyebrow__idx">/ 02</span>
          <span>
            <Wordmark variant="inline" />
          </span>
        </span>
        <h1 className="ds-hero__h ds-hero__h--dot">
          <em>imopush</em> — coming soon.
        </h1>
        <p className="ds-hero__tagline">
          Scaffold only. First slice lands in a follow-up commit.
        </p>
      </header>
    </main>
  )
}
