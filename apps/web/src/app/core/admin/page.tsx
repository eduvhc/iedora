import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Card, CardTitle, CardDesc } from '@iedora/design-system'
import { requireIedoraAdmin } from '@iedora/product-core'

/**
 * Admin landing for the `core` product. Links to the per-surface
 * admin tools (sessions today; users + audit when those land).
 *
 * Gate via `requireIedoraAdmin` — cross-tenant role on the user row.
 */
export default async function CoreAdminHome() {
  await requireIedoraAdmin()
  const t = await getTranslations('Core.admin')

  return (
    <Card>
      <CardTitle as="h2">{t('title')}</CardTitle>
      <CardDesc>{t('subtitle')}</CardDesc>
      <ul className="mt-6 space-y-3">
        <li>
          <Link
            href="/admin/sessions"
            className="underline"
            data-test-id="core-admin-link-sessions"
          >
            {t('sessions.title')}
          </Link>
        </li>
      </ul>
    </Card>
  )
}
