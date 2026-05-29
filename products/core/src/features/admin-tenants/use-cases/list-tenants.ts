import 'server-only'
import type {
  AdminTenantsGateway,
  ListTenantsInput,
  ListTenantsResult,
} from '../ports'

/**
 * Pure read-through to the gateway — exists so the use-case layer has
 * a single seam for tests (pass a fake gateway) and for future
 * decoration (audit success, OTel span, etc.).
 *
 * Caller MUST have `staff.core.tenants.list`. Guard at the page,
 * not here — this file stays adapter-agnostic.
 */
export async function listTenants(
  gateway: AdminTenantsGateway,
  input: ListTenantsInput,
): Promise<ListTenantsResult> {
  return gateway.listTenants(input)
}
