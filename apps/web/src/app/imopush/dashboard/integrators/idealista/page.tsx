import { Card, CardTitle, CardDesc } from '@iedora/design-system'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { StatusChip } from '@iedora/product-imopush/shared/ui/status-chip'
import { getTranslations } from 'next-intl/server'

export default async function IdealistaIntegratorPage() {
  const t = await getTranslations('Imopush.IdealistaIntegrator')
  const tList = await getTranslations('Imopush.PropertyList')

  return (
    <DashboardPage
      title={t('title')}
      crumbs={[{ label: tList('title'), href: '/imopush/dashboard' }]}
      data-test-id="integrator-idealista"
      description={t('description')}
    >
      <Card data-test-id="integrator-idealista-card">
        <CardTitle>{t('accountLabel')}</CardTitle>
        <CardDesc>
          <span className="font-medium text-foreground">
            eduardoferdcarvalho+agency@gmail.com
          </span>
        </CardDesc>
        <div className="mt-3 flex items-center gap-2 text-[13px]">
          <span className="text-[var(--ink-60)]">{t('stateLabel')}</span>
          <StatusChip label={t('stateActive')} variant="success" />
        </div>
        <p className="mt-3 text-[12.5px] text-[var(--ink-60)]">{t('note')}</p>
      </Card>
    </DashboardPage>
  )
}
