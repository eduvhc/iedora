import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '../../../shared/db/client'
import { restaurant } from '../../../shared/db/schema'

/**
 * Flip `restaurant.onboarding_completed_at` to now for the given
 * slug. Idempotent — re-running on an already-completed row simply
 * overwrites the timestamp, which is harmless. Tenancy is enforced
 * by the caller (route handler runs `requireRestaurantBySlug` first);
 * this helper trusts the slug.
 */
export async function markRestaurantOnboardingComplete(
  slug: string,
): Promise<void> {
  await db
    .update(restaurant)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(restaurant.slug, slug))
}
