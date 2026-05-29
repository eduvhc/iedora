import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Card, CardDesc } from '@iedora/design-system'
import { requireScope } from '@iedora/product-core'
import {
  drizzleAdminTenantsGateway,
  listTenants,
} from '@iedora/product-core/features/admin-tenants'
import { SCOPES } from '@iedora/auth/scopes'
import { AdminPage } from '@iedora/product-core/shared/ui/admin-page'

/**
 * Cross-tenant tenant list — staff drilling into the customer base.
 * Read-only today (mutations land in a follow-up with the
 * `staff.core.tenants.delete` + `staff.core.members.*` actions).
 *
 * Replaces the deleted `/core/admin/organizations` page (which was
 * for better-auth's organization entity, gone). Same role on the
 * sidebar; new data model behind it.
 *
 * Pagination via search-params (`?page=N&q=&sort=&dir=`). Cap
 * pageSize at 50 — anything heavier means we need a real list view
 * with virtualisation.
 */

type SearchParams = {
  page?: string
  q?: string
  sort?: 'createdAt' | 'name'
  dir?: 'asc' | 'desc'
}

const PAGE_SIZE = 25

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireScope(SCOPES.core.staff.tenants.list)
  const t = await getTranslations('Core.admin.tenants')

  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? '1') || 1)
  const sort: 'createdAt' | 'name' = sp.sort === 'name' ? 'name' : 'createdAt'
  const dir: 'asc' | 'desc' = sp.dir === 'asc' ? 'asc' : 'desc'

  const { tenants, total } = await listTenants(drizzleAdminTenantsGateway(), {
    page,
    pageSize: PAGE_SIZE,
    q: sp.q?.trim() || undefined,
    sortBy: sort,
    sortDirection: dir,
  })

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const dateFmt = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <AdminPage
      crumbs={[{ label: t('crumbAdmin'), href: '/core/admin', testId: 'admin' }]}
      title={t('title')}
      description={t('description', { count: total })}
      data-test-id="admin-tenants-page"
    >
      <form
        method="get"
        className="flex flex-wrap items-end gap-3"
        data-test-id="admin-tenants-filter"
      >
        <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.18em] text-[var(--ink-40)]">
          {t('searchLabel')}
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder={t('searchPlaceholder')}
            className="border border-[var(--ink-14)] bg-[var(--paper)] px-3 py-2 text-sm font-normal text-[var(--ink)] normal-case tracking-normal"
            data-test-id="admin-tenants-search-input"
          />
        </label>
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <button
          type="submit"
          className="border border-[var(--ink)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          data-test-id="admin-tenants-search-submit"
        >
          {t('searchSubmit')}
        </button>
      </form>

      {tenants.length === 0 ? (
        <Card data-test-id="admin-tenants-empty">
          <CardDesc>{t('empty')}</CardDesc>
        </Card>
      ) : (
        <div
          className="border border-[var(--ink-14)] overflow-hidden"
          data-test-id="admin-tenants-list"
        >
          <table className="w-full text-sm">
            <thead className="bg-[var(--ink-04)] text-[10.5px] uppercase tracking-[0.18em] text-[var(--ink-40)]">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t('colName')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('colMembers')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tn) => (
                <tr
                  key={tn.id}
                  className="border-t border-[var(--ink-08)]"
                  data-test-id={`admin-tenants-row-${tn.id}`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/core/admin/tenants/${tn.id}`}
                      className="font-medium text-[var(--ink)] no-underline hover:underline"
                      data-test-id={`admin-tenants-row-${tn.id}-link`}
                    >
                      {tn.name}
                    </Link>
                    <div className="font-[family-name:var(--mono)] text-[11px] text-[var(--ink-40)]">
                      {tn.id}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {tn.memberCount}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--ink-70)] tabular-nums">
                    {dateFmt.format(tn.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[var(--ink-55)]"
          aria-label={t('paginationLabel')}
          data-test-id="admin-tenants-pagination"
        >
          <span>
            {t('paginationPosition', { page, total: totalPages })}
          </span>
          <div className="flex gap-3">
            <PageLink
              disabled={page <= 1}
              params={{ ...sp, page: String(page - 1) }}
              testId="admin-tenants-prev"
            >
              {t('paginationPrev')}
            </PageLink>
            <PageLink
              disabled={page >= totalPages}
              params={{ ...sp, page: String(page + 1) }}
              testId="admin-tenants-next"
            >
              {t('paginationNext')}
            </PageLink>
          </div>
        </nav>
      ) : null}
    </AdminPage>
  )
}

function PageLink({
  params,
  disabled,
  testId,
  children,
}: {
  params: Record<string, string | undefined>
  disabled?: boolean
  testId: string
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span
        className="text-[var(--ink-22)]"
        aria-disabled="true"
        data-test-id={testId}
      >
        {children}
      </span>
    )
  }
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, v)
  }
  return (
    <Link
      href={`/core/admin/tenants?${qs.toString()}`}
      className="hover:text-[var(--ink)]"
      data-test-id={testId}
    >
      {children}
    </Link>
  )
}
