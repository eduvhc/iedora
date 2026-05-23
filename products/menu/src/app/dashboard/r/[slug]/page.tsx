import { getLocale, getTranslations } from 'next-intl/server'
import { requireRestaurantBySlug } from '@/features/auth'
import { loadRestaurantAdminMenus } from '@/features/menu-publishing'
import { Button, Card, CardDesc, CardTitle } from '@iedora/design-system'
import { DashboardPage } from '@/shared/ui/dashboard-page'
import {
  EditorialList,
  formatEditedAt,
  formatIndex,
  type EditorialRowData,
} from '@/shared/ui/editorial-list'
import { CreateMenuDialog } from '@/features/menu-builder/ui/create-menu-dialog'
import { DeleteMenuButton } from '@/features/menu-builder/ui/delete-menu-button'
import { SeedSampleButton } from '@/features/menu-builder/ui/seed-sample-button'
import { ImportMenuDialog } from '@/features/menu-import/ui/import-menu-dialog'
import { AiTranslationDialog } from '@/features/menu-translation/ui/ai-translation-dialog'
import { eq } from 'drizzle-orm'
import { db } from '@/shared/db/client'
import { restaurant as restaurantTable } from '@/shared/db/schema'
import type { LanguageCode } from '@/features/i18n'

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // Auth + tenant scoping (per request, uncached): the user must be a member
  // of the org owning this restaurant. The cached snapshot below trusts that
  // the slug is OK to read because this guard has run first.
  const { restaurant: r } = await requireRestaurantBySlug(slug)
  const t = await getTranslations('Restaurant')
  const tDash = await getTranslations('Dashboard')
  const locale = await getLocale()

  // Cached menus list, tagged `restaurant:${slug}` — invalidated by the same
  // `revalidateRestaurant(slug)` chokepoint the public page uses, so any
  // menu/category/item save the admin does is visible on the next render
  // without a separate revalidate call here.
  const snap = await loadRestaurantAdminMenus(slug)
  const menus = snap?.menus ?? []

  // Restaurant language config for the AI Translation dialog. One row,
  // tiny projection — not worth a cached helper.
  const [langConfig] = await db
    .select({
      defaultLanguage: restaurantTable.defaultLanguage,
      supportedLanguages: restaurantTable.supportedLanguages,
    })
    .from(restaurantTable)
    .where(eq(restaurantTable.id, r.id))
    .limit(1)
  const defaultLanguage =
    (langConfig?.defaultLanguage as LanguageCode | undefined) ?? 'en'
  const supportedLanguages =
    (langConfig?.supportedLanguages as LanguageCode[] | null) ?? [
      defaultLanguage,
    ]

  const rows: EditorialRowData[] = menus.map((m, i) => ({
    id: m.id,
    href: `/dashboard/r/${slug}/m/${m.id}`,
    title: m.name,
    index: formatIndex(i + 1),
    subtitle: (
      <span>{tDash('editedAt', { when: formatEditedAt(m.updatedAt, locale) })}</span>
    ),
    metadata: `${t('categoryCount', { count: m.categoryCount })} · ${t('dishCount', { count: m.dishCount })}`,
    extraActions: (
      <DeleteMenuButton slug={slug} menuId={m.id} menuName={m.name} />
    ),
  }))

  const actions = (
    <>
      <Button as="a" href={`/dashboard/r/${slug}/theme`} data-test-id="restaurant-action-settings">
        {t('settings')}
      </Button>
      <Button as="a" href={`/dashboard/r/${slug}/qr`} data-test-id="restaurant-action-qr">
        {t('qrCode')}
      </Button>
      <Button
        as="a"
        href={`/r/${r.slug}`}
        target="_blank"
        rel="noreferrer"
        data-test-id="restaurant-action-view"
      >
        {t('viewPublicMenu')}
      </Button>
    </>
  )

  return (
    <DashboardPage
      title={r.name}
      data-test-id="restaurant"
      actions={actions}
    >
      <EditorialList
        testId="menu-list"
        header={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-medium">{t('menus')}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <AiTranslationDialog
                slug={slug}
                defaultLanguage={defaultLanguage}
                supportedLanguages={supportedLanguages}
              />
              <SeedSampleButton slug={slug} />
              <ImportMenuDialog slug={slug} restaurantId={r.id} />
              <CreateMenuDialog slug={slug} />
            </div>
          </div>
        }
        rows={rows}
        emptyState={
          <Card>
            <CardTitle>{t('noMenus')}</CardTitle>
            <CardDesc>{t('noMenusHint')}</CardDesc>
          </Card>
        }
      />
    </DashboardPage>
  )
}
