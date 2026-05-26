import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { Card, CardTitle, CardDesc, EmptyState, Table } from '@iedora/design-system'
import { requireIedoraAdmin } from '@iedora/product-core'
import { auth } from '@iedora/auth'
import { SessionRow } from './session-row'

type AdminSessionRow = {
  id: string
  token: string
  userId: string
  userEmail: string
  userName: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
  expiresAt: Date
}

/**
 * Sessions admin — the iedora-staff view of every active session
 * across every product. Replaces the slice that lived under the
 * menu's `dashboard/admin/sessions` route. Data sourced through
 * `auth.api.*` (fan-out per user); the cross-product boundary
 * (`packages/auth/README.md`) means we never touch `core.session`
 * directly even though this page IS the core product's surface.
 */
export default async function SessionsAdmin() {
  await requireIedoraAdmin()
  const t = await getTranslations('Core.admin.sessions')
  const h = await headers()

  const usersResponse = await auth.api.listUsers({
    query: { limit: 200, sortBy: 'createdAt', sortDirection: 'desc' },
    headers: h,
  })

  const rows: AdminSessionRow[] = []
  for (const user of usersResponse.users) {
    const sessions = await auth.api.listUserSessions({
      body: { userId: user.id },
      headers: h,
    })
    for (const s of sessions.sessions) {
      rows.push({
        id: s.id,
        token: s.token,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        ipAddress: s.ipAddress ?? null,
        userAgent: s.userAgent ?? null,
        createdAt: new Date(s.createdAt),
        expiresAt: new Date(s.expiresAt),
      })
    }
  }

  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return (
    <Card>
      <CardTitle as="h2">{t('title')}</CardTitle>
      <CardDesc>{t('subtitle')}</CardDesc>
      {rows.length === 0 ? (
        <EmptyState label={t('empty')} />
      ) : (
        <Table data-test-id="core-admin-sessions-table">
          <thead>
            <tr>
              <th>{t('columnUser')}</th>
              <th>{t('columnDevice')}</th>
              <th>{t('columnIp')}</th>
              <th>{t('columnIssued')}</th>
              <th>{t('columnExpires')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <SessionRow
                key={row.id}
                rowId={row.id}
                token={row.token}
                userEmail={row.userEmail}
                userName={row.userName}
                ipAddress={row.ipAddress}
                userAgent={row.userAgent}
                createdAtIso={row.createdAt.toISOString()}
                expiresAtIso={row.expiresAt.toISOString()}
              />
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}
