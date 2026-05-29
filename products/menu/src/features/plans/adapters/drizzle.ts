import 'server-only'
import { and, count, eq, gt } from 'drizzle-orm'
import { db } from '../../../shared/db/client'
import { aiMenuGeneration, orgPlan, restaurant } from '../../../shared/db/schema'
import type { PlansGateway } from '../ports'

/**
 * Production PlansGateway. Wraps Drizzle reads/writes against the LOCAL
 * `org_plan` table (menu-owned) and the `restaurant` count. Plans are a
 * menu-domain concept (gate restaurant counts, monthly views, etc.) and
 * are keyed by the Genkan-issued `tenantId` — there's no FK,
 * Genkan is a separate database.
 *
 * Missing rows mean "never set a plan yet" — `getOrgPlan` returns null
 * and the use-case coerces back to the default via `getPlan`. The
 * onboarding flow inserts a default row when it first creates a
 * restaurant for the org.
 *
 * Server-only — the Drizzle client never belongs on the client.
 */
export const drizzlePlans: PlansGateway = {
  async getOrgPlan(tenantId) {
    const rows = await db
      .select({ plan: orgPlan.plan })
      .from(orgPlan)
      .where(eq(orgPlan.tenantId, tenantId))
      .limit(1)
    return rows[0]?.plan ?? null
  },

  async countOrgRestaurants(tenantId) {
    const rows = await db
      .select({ value: count() })
      .from(restaurant)
      .where(eq(restaurant.tenantId, tenantId))
    return Number(rows[0]?.value ?? 0)
  },

  async updateOrgPlan(tenantId, code) {
    // Upsert: this is the only place that writes the `org_plan` row, so we
    // treat "no row yet" as success-by-create instead of an error.
    await db
      .insert(orgPlan)
      .values({ tenantId, plan: code })
      .onConflictDoUpdate({
        target: orgPlan.tenantId,
        set: { plan: code },
      })
    return true
  },

  async countAiGenerationsSince(tenantId, since) {
    const rows = await db
      .select({ value: count() })
      .from(aiMenuGeneration)
      .where(
        and(
          eq(aiMenuGeneration.tenantId, tenantId),
          gt(aiMenuGeneration.createdAt, since),
        ),
      )
    return Number(rows[0]?.value ?? 0)
  },

  async recordAiGeneration(tenantId) {
    await db.insert(aiMenuGeneration).values({ tenantId })
  },
}
