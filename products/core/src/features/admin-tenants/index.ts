/**
 * @iedora/product-core/features/admin-tenants — cross-tenant admin
 * surface for `staff:core:tenants:*`. Read-only today (list + detail);
 * mutation verbs land in a follow-up.
 *
 * Routes that consume this slice live at
 * `apps/web/src/app/core/admin/tenants/*`.
 */

export type {
  AdminTenantsGateway,
  ListTenantsInput,
  ListTenantsResult,
  TenantDetail,
  TenantRow,
  TenantMemberRow,
  TenantSubscriptionRow,
} from './ports'

export { drizzleAdminTenantsGateway } from './adapters/drizzle'
export { listTenants } from './use-cases/list-tenants'
export { getTenant } from './use-cases/get-tenant'
