import 'server-only'
import type { PlansGateway } from '../ports'

/**
 * Returns how many restaurants the organization currently owns. Used by the
 * `canAddRestaurant` gate; exposed at the slice boundary so the dashboard
 * can show "x of y restaurants" copy without re-counting.
 */
export async function getOrganizationRestaurantCount(
  plans: PlansGateway,
  tenantId: string,
): Promise<number> {
  return plans.countOrgRestaurants(tenantId)
}
