import Link from 'next/link'
import {
  Sidebar,
  SidebarBrand,
  SidebarClose,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
  Wordmark,
} from '@iedora/design-system'
import { ActiveSidebarLinks, type ActiveSidebarItem } from '@/shared/ui/active-sidebar-links'

const navItems: ReadonlyArray<ActiveSidebarItem> = [
  { href: '/dashboard', label: 'Propriedades', testId: 'nav-properties', matchPrefix: false },
  { kind: 'section', label: 'Integradores', testId: 'nav-integrators-section' },
  { href: '/dashboard/integrators/idealista', label: 'Idealista', testId: 'nav-idealista' },
  { href: '/dashboard/integrators/olx', label: 'OLX', testId: 'nav-olx' },
  { href: '/dashboard/integrators/custo-justo', label: 'Custo Justo', testId: 'nav-custo-justo' },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {

  return (
    <SidebarProvider>
      <div className="flex min-h-screen flex-col bg-[var(--paper)] lg:flex-row">
        <SidebarTrigger aria-label="Abrir navegação" data-test-id="dashboard-sidebar-trigger" />
        <Sidebar aria-label="Navegação principal" data-test-id="dashboard-chrome">
          <SidebarClose aria-label="Fechar navegação" data-test-id="dashboard-sidebar-close" />
          <SidebarBrand>
            <Link href="/dashboard" className="brand" aria-label="Ir para o início" data-test-id="dashboard-home-link">
              <Wordmark word="imopush" variant="inline" className="ds-wordmark--reveal" />
            </Link>
          </SidebarBrand>
          <ActiveSidebarLinks ariaLabel="Navegação principal" items={navItems} />
          <SidebarFooter>
            <span className="font-[family-name:var(--mono)] text-[10.5px] uppercase tracking-[0.18em] text-[var(--ink-40)]">
              v0.1 · sem auth
            </span>
          </SidebarFooter>
        </Sidebar>
        <main className="ds-shell flex-1 pt-5 pb-10 sm:pt-7 sm:pb-14 lg:pt-8 lg:pb-16">
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
