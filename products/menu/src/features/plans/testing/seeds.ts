import 'server-only'
import { testDb } from '../../../shared/testing/e2e-db'
import type { PlanCode } from '../types'

/**
 * `org_plan` is menu-owned billing metadata keyed by better-auth org id.
 * `setPlan` upserts so a spec can flip free → casa to exercise the
 * upgrade flow without re-seeding the row.
 */
export async function setPlan(
  tenantId: string,
  plan: PlanCode,
): Promise<void> {
  const sql = testDb()
  await sql`
    INSERT INTO "menu"."org_plan" (tenant_id, plan)
    VALUES (${tenantId}, ${plan})
    ON CONFLICT (tenant_id) DO UPDATE
      SET plan = EXCLUDED.plan, updated_at = now()
  `
}

export async function getPlan(tenantId: string): Promise<PlanCode | null> {
  const sql = testDb()
  const [row] = await sql<{ plan: PlanCode }[]>`
    SELECT plan FROM "menu"."org_plan" WHERE tenant_id = ${tenantId}
  `
  return row?.plan ?? null
}
