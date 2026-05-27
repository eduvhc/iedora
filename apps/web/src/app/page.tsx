// Dev surface index: in production each host rewrites to its own surface — this only renders on bare http://localhost:3000/.
import Link from 'next/link'
import { surfaces } from '../generated/surfaces'

export default function DevSurfaceIndex() {
  const entries = surfaces.map((s) => ({
    name: s.name,
    href: s.rewritePath || '/',
  }))

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--paper)] p-8 text-[var(--ink)]">
      <h1 className="font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--ink-55)]">
        iedora · dev surface index
      </h1>
      <ul className="flex flex-col items-center gap-3">
        {entries.map((s) => (
          <li key={s.name}>
            <Link
              href={s.href}
              className="text-[17px] no-underline underline-offset-4 hover:underline"
              data-test-id={`dev-index-link-${s.name}`}
            >
              /{s.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
