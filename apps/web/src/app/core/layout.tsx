import Link from 'next/link'
import { Wordmark } from '@iedora/design-system'
import { BRAND_URL } from '@iedora/brand'

/**
 * Shell for every page on the `core` product (sign-in / sign-up /
 * sign-out / admin). Mirrors the menu's editorial chrome — paper
 * background, centered Wordmark header, no chrome navigation. The
 * proxy.ts rewrite means these pages render under `core.iedora.com/*`
 * (prod) and `localhost:3000/core/*` (dev) without any per-page
 * awareness of the host.
 */
export default function CoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--paper)]">
      <header className="border-b border-[var(--ink)]/10 px-6 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href={BRAND_URL} aria-label="iedora">
            <Wordmark variant="inline" />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}
