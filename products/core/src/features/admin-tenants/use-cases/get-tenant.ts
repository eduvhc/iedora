import 'server-only'
import type { AdminTenantsGateway, TenantDetail } from '../ports'

/**
 * Single-tenant read with members + subscriptions. Caller MUST have
 * `staff.core.tenants.get`. Returns `null` on unknown id; the route
 * `notFound()`s in that case.
 */
export async function getTenant(
  gateway: AdminTenantsGateway,
  tenantId: string,
): Promise<TenantDetail | null> {
  return gateway.getTenant(tenantId)
}
