import { BUNDLES, getSession, requireIedoraAdmin } from '@/features/auth'
import { loadAdminPayload } from '@/features/sessions'
import { SessionsAdmin } from '@/features/sessions/ui/sessions-admin'
import { toSessionAdminRow } from '@/features/sessions/ui/to-row'
import { DashboardPage } from '@iedora/design-system'

/**
 * Cross-tenant session triage. iedora-admin only — the gate hides the
 * surface from tenant users (404 on missing role, no leak of existence).
 *
 * One server-side fetch (`loadAdminPayload`) bundles:
 *   - session rows from menu.session,
 *   - per-user Zitadel summaries (state, displayName, MFA),
 *   - aggregate stats (total / unique users / new 24h / stale / etc).
 *
 * Zitadel enrichment fails soft — rows still render with menu-side
 * fallbacks if the mgmt API is down.
 */
export default async function SessionsAdminPage() {
  await requireIedoraAdmin()

  const [payload, current] = await Promise.all([
    loadAdminPayload(),
    getSession(),
  ])

  const rows = payload.rows.map((r) =>
    toSessionAdminRow(
      r,
      current?.sid ?? null,
      payload.users.get(r.userId),
      payload.authMethods.get(r.userId),
    ),
  )

  return (
    <DashboardPage title="Sessions" data-test-id="sessions-admin">
      <SessionsAdmin
        rows={rows}
        stats={payload.stats}
        snapshotAt={payload.snapshotAt.toISOString()}
        bundles={BUNDLES}
      />
    </DashboardPage>
  )
}
