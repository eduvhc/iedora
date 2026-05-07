import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getEffectiveOrganizationId } from '@/lib/dal'
import { LogoutButton } from './logout-button'
import { UserLocaleSwitcher } from './user-locale-switcher'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login')

  const organizationId = await getEffectiveOrganizationId(
    session.user.id,
    session.session.activeOrganizationId,
  )
  if (!organizationId) redirect('/onboarding')

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="inline-flex items-baseline gap-2 text-foreground no-underline"
            aria-label="Meta Menu home"
          >
            <span
              aria-hidden="true"
              className="translate-y-[2px] font-serif text-[22px] italic leading-none text-brand"
            >
              ⁋
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              Meta <em className="font-serif italic font-medium">Menu</em>
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <UserLocaleSwitcher />
            <span className="text-muted-foreground">{session.user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
