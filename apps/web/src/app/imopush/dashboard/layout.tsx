import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  Sidebar,
  SidebarBrand,
  SidebarClose,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
  Wordmark,
} from '@iedora/design-system'
import { ToastsProvider } from '@iedora/product-imopush/shared/ui/toasts'
import {
  ActiveSidebarLinks,
  type ActiveSidebarItem,
} from './_components/active-sidebar-links'

export default async function ImopushDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const nav = await getTranslations('Imopush.Nav')

  const navItems: ReadonlyArray<ActiveSidebarItem> = [
    {
      href: '/imopush/dashboard',
      label: nav('properties'),
      testId: 'imopush-nav-properties',
      matchPrefix: false,
    },
    { kind: 'section', label: nav('integrators'), testId: 'imopush-nav-integrators-section' },
    {
      href: '/imopush/dashboard/integrators/idealista',
      label: nav('idealista'),
      testId: 'imopush-nav-idealista',
    },
  ]

  return (
    <SidebarProvider>
      <ToastsProvider>
        <div className="flex min-h-screen flex-col bg-[var(--paper)] lg:flex-row">
          <SidebarTrigger
            aria-label={nav('ariaLabel')}
            data-test-id="imopush-sidebar-trigger"
          />
          <Sidebar aria-label={nav('ariaLabel')} data-test-id="imopush-chrome">
            <SidebarClose
              aria-label={nav('ariaLabel')}
              data-test-id="imopush-sidebar-close"
            />
            <SidebarBrand>
              <Link
                href="/imopush/dashboard"
                className="brand"
                aria-label={nav('ariaLabel')}
                data-test-id="imopush-home-link"
              >
                <Wordmark word="imopush" variant="inline" className="ds-wordmark--reveal" />
              </Link>
            </SidebarBrand>
            <ActiveSidebarLinks ariaLabel={nav('ariaLabel')} items={navItems} />
            <SidebarFooter />
          </Sidebar>
          <main className="ds-shell flex-1 pt-5 pb-10 sm:pt-7 sm:pb-14 lg:pt-8 lg:pb-16">
            {children}
          </main>
        </div>
      </ToastsProvider>
    </SidebarProvider>
  )
}
