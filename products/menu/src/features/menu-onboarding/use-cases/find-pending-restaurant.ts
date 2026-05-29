import 'server-only'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../../../shared/db/client'
import { restaurant } from '../../../shared/db/schema'

/**
 * Locate the oldest restaurant belonging to `tenantId` whose
 * post-create wizard never finished (`onboarding_completed_at IS NULL`).
 *
 * Used by `/menu/onboarding` to bounce a back-navigation back into
 * step 2 instead of letting the operator silently create a duplicate
 * restaurant from step 1. Returns `null` when the tenant has nothing
 * pending — the caller is free to render the "create another
 * restaurant" form.
 *
 * "Oldest" because if a tenant ever ends up with multiple pending
 * rows (an aborted flow + a second submit), we resume the earliest
 * — finishing it first keeps the timeline coherent.
 */
export async function findPendingOnboardingRestaurant(
  tenantId: string,
): Promise<{ slug: string } | null> {
  const rows = await db
    .select({ slug: restaurant.slug })
    .from(restaurant)
    .where(
      and(
        eq(restaurant.tenantId, tenantId),
        isNull(restaurant.onboardingCompletedAt),
      ),
    )
    .orderBy(asc(restaurant.createdAt))
    .limit(1)
  return rows[0] ?? null
}
