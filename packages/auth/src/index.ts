/**
 * @iedora/auth — public API.
 *
 * Server entry. Browser code imports from `@iedora/auth/client` instead
 * (the `better-auth/react` client lives there). Permissions taxonomy
 * (`statement`, `ac`, role definitions) is also re-exported here for
 * convenience; deep import `@iedora/auth/permissions` for the same
 * surface without pulling the server-only modules.
 */

export { getAuth, auth } from './auth'
export type { Auth, AuthSession } from './auth'

// Role presets + literals (single source of truth for staff role IDs)
export {
  statement,
  ac,
  STAFF_ROLES,
  IEDORA_ADMIN_ROLE,
  IEDORA_SUPPORT_ROLE,
  STAFF_ROLE_PRESETS,
  TENANT_ROLE_PRESETS,
  TENANT_ROLE_PRESET_KEYS,
  detectStaffPreset,
  detectTenantPreset,
  isStaffRole,
  type Statement,
  type StaffRoleKey,
  type TenantRolePresetKey,
} from './permissions'

export { schema } from './schema'
export { getCoreDb } from './db'

export { recordAudit } from './audit'
export type { AuditInput, AuditOutcome } from './audit'

// Tenancy primitives (cross-product). Replace the former better-auth
// `organization` plugin surface.
export {
  createTenant,
  getTenantById,
  listUserTenants,
  hasAnyTenant,
  type Tenant,
} from './tenants'
export {
  upsertMember,
  removeMember,
  listMembers,
  getMemberScopes,
  type TenantMember,
} from './tenant-members'
export {
  getActiveTenantId,
  setActiveTenant,
} from './sessions'

// Staff (cross-tenant) primitives. Replace the former better-auth
// `admin` plugin surface — ban / impersonate / list-users live here
// now, working over the schema columns better-auth had configured.
export {
  getUserScopes,
  setUserScopes,
  userHasScope,
  isStaffUser,
  banUser,
  unbanUser,
  isBanned,
  impersonateUser,
  stopImpersonating,
  listUsers,
  getUser,
  type UserRow,
  type ListUsersFilter,
  type ListUsersResult,
} from './staff'
