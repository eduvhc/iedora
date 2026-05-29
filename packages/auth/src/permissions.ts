/**
 * Iedora access-control taxonomy — the single source of truth for what
 * each role can do across every product in the estate.
 *
 * Shape comes from better-auth's `createAccessControl` primitive: a
 * `statement` declares the resources + the actions each resource exposes,
 * then roles are bound to subsets of those (resource, action) pairs.
 *
 * THREE orthogonal axes are encoded in every scope string:
 *
 *   <kind>:<product>:<resource>:<verb>
 *
 *   - kind:     `tenant` (per-org, resolved against `member.role` + the
 *               active organization context) vs `staff` (cross-tenant,
 *               resolved against `user.role`).
 *   - product:  `core` (auth + admin surface), `menu` (restaurant SaaS),
 *               and the products that follow. Reflects `products/<x>/`
 *               in the monorepo. Without this axis, identically-named
 *               resources in different products would collide (e.g.
 *               `tenant.menu.billing` vs a future `tenant.imopush.billing`).
 *   - resource: kebab plural noun (`users`, `restaurants`, `qr-codes`).
 *   - verb:     single kebab. CRUD-canonical (`create`/`read`/`update`/
 *               `delete` — or `list`/`get` when distinguishing matters)
 *               with special verbs (`ban`, `impersonate`, `set-role`,
 *               `publish`, `revoke`) reserved for actions whose blast
 *               radius differs from a normal mutation.
 *
 * Statement keys are the dotted form (`'tenant.menu.qr-codes'`) — better-
 * auth's `createAccessControl` accepts arbitrary string keys, and the
 * dot-separator lets `scopeToPermission('tenant:menu:qr-codes:read')`
 * become a trivial `parts.pop()` + `parts.join('.')`.
 *
 * Framework-free. Imported from server use-cases, route handlers, tests,
 * and the better-auth instance configuration. MUST NOT depend on
 * `server-only`, `next`, or any DB client.
 */

import { createAccessControl } from 'better-auth/plugins/access'

import { SCOPES, ALL_SCOPES, type Scope } from './scopes'

/**
 * Resource → actions taxonomy. Extend by adding either a new key (new
 * resource) or a new entry to an existing array (new verb).
 *
 * `...defaultStatements` pulls in the resources better-auth's
 * organization plugin defines itself (`organization`, `member`,
 * `invitation`, `team`) — these stay single-segment because the org
 * plugin evaluates them internally and renaming would break the
 * gating it does in request handlers. See
 * `docs/auth/custom-plugin-investigation.md` (TBD) for the path to
 * lifting that limitation.
 */
export const statement = {
  // ── Per-tenant: menu product ─────────────────────────────────────
  'tenant.menu.restaurants': ['read', 'create', 'update', 'delete'],
  'tenant.menu.qr-codes':    ['read', 'create', 'update', 'delete'],

  // ── Per-tenant: imopush product ──────────────────────────────────
  'tenant.imopush.properties': ['read', 'create', 'update', 'delete'],
  'tenant.imopush.idealista':  ['publish'],

  // ── Per-tenant: cross-product concerns owned by core ─────────────
  'tenant.core.members': ['read', 'invite', 'remove', 'grant'],
  'tenant.core.billing': ['read', 'change-plan', 'update-payment'],
  'tenant.core.tenant':  ['delete'],

  // ── Control plane: core product (cross-tenant staff) ─────────────
  // `users` verbs split by blast radius:
  //   - read        — list/view + their sessions
  //   - ban         — ban + unban (reversible lifecycle)
  //   - set-role    — ISOLATED: grant/revoke staff roles. Sub-roles
  //                   without this scope cannot self-escalate.
  //   - impersonate — ISOLATED: act as a user. Different blast.
  'staff.core.users': ['read', 'ban', 'set-role', 'impersonate'],

  // `orgs` — cross-tenant view only today (no admin UI to mutate org
  // metadata or provision tenants manually; add verbs when surfaces
  // appear).
  'staff.core.orgs': ['list', 'get'],

  // `members` — membership operations across any org. Split because
  //   - `remove` is troubleshooting blast (support tier can do it),
  //   - `update-role` is escalation blast (can grant tenant owner;
  //     admin-only).
  'staff.core.members': ['remove', 'update-role'],

  // `invitations` — revoke pending org invites. (Listing is part of
  // the org detail read; no standalone `list` verb today.)
  'staff.core.invitations': ['cancel'],

  // `sessions` — every session across every user. `revoke` is the
  // canonical scope for killing a session, replacing the earlier
  // overload on `users:ban`.
  'staff.core.sessions': ['list', 'revoke'],

  // `audit` — read-only timeline of every state change on the
  // auth/admin surface. Bound to `iedora-admin` via the wildcard;
  // deliberately NOT in `iedora-support`. A future `Auditor` role
  // could carry just this scope and nothing else.
  'staff.core.audit': ['read'],

  // `admin` — "may render the cross-tenant admin shell at all". Held
  // by both staff roles (iedora-admin via wildcard, iedora-support
  // by explicit binding). Used by the admin layout + overview as the
  // entry gate — anyone without this scope cannot reach any admin
  // surface, including the ones with their own narrower scope
  // (no orphan deep-links).
  'staff.core.admin': ['read'],
} as const

/**
 * AC instance — kept so the `statement` shape stays declarative and
 * downstream tooling (admin Access page introspection) can still bind
 * resources for visualisation. Better-auth's `organization` and
 * `admin` plugins were dropped — authorisation now reads
 * `tenant_member.scopes` (per-tenant) or `user.scopes` (staff)
 * directly, without going through `ac.authorize()`.
 */
export const ac = createAccessControl(statement)

// ─── Role literal constants (single source of truth for staff IDs) ──

/**
 * Cross-tenant staff role literals — the two preset keys recognised
 * across iedora. Every callsite that compares a value against
 * `'iedora-admin'` / `'iedora-support'` imports these — no inline
 * string literals.
 */
export const IEDORA_ADMIN_ROLE = 'iedora-admin' as const
export const IEDORA_SUPPORT_ROLE = 'iedora-support' as const
export const STAFF_ROLES = [IEDORA_ADMIN_ROLE, IEDORA_SUPPORT_ROLE] as const
export type StaffRoleKey = (typeof STAFF_ROLES)[number]

// ─── Presets — UX shortcuts that expand to scope arrays ─────────────

const STAFF_PREFIX = 'staff:'
const TENANT_PREFIX = 'tenant:'

/**
 * Staff role presets — applied to `user.scopes` (text[] column).
 * Adding a new staff role like `'iedora-auditor'` = one entry here,
 * nothing else changes. `'iedora-admin'` wildcards every staff scope
 * automatically via `ALL_SCOPES.filter` so new scopes are covered
 * with zero drift.
 */
export const STAFF_ROLE_PRESETS = {
  [IEDORA_ADMIN_ROLE]: ALL_SCOPES.filter((s) => s.startsWith(STAFF_PREFIX)),
  [IEDORA_SUPPORT_ROLE]: [
    SCOPES.core.staff.admin.read,
    SCOPES.core.staff.users.read,
    SCOPES.core.staff.users.ban,
    SCOPES.core.staff.orgs.list,
    SCOPES.core.staff.orgs.get,
    SCOPES.core.staff.members.remove,
    SCOPES.core.staff.invitations.cancel,
    SCOPES.core.staff.sessions.list,
    SCOPES.core.staff.sessions.revoke,
  ],
} as const satisfies Record<StaffRoleKey, readonly Scope[]>

/**
 * Tenant role presets — applied to `tenant_member.scopes` when a UI
 * picker chooses "Owner" / "Admin" / "Member" / "Viewer". The custom
 * grant case (e.g. Mario-only-idealista) skips presets and writes a
 * bespoke array directly.
 */
export const TENANT_ROLE_PRESETS = {
  owner: ALL_SCOPES.filter((s) => s.startsWith(TENANT_PREFIX)),
  admin: ALL_SCOPES.filter(
    (s) => s.startsWith(TENANT_PREFIX) && s !== SCOPES.core.tenant.tenant.delete,
  ),
  member: [
    SCOPES.menu.tenant.restaurants.read,
    SCOPES.menu.tenant.restaurants.create,
    SCOPES.menu.tenant.restaurants.update,
    SCOPES.menu.tenant.qrCodes.read,
    SCOPES.menu.tenant.qrCodes.create,
    SCOPES.menu.tenant.qrCodes.update,
    SCOPES.imopush.tenant.properties.read,
    SCOPES.imopush.tenant.properties.create,
    SCOPES.imopush.tenant.properties.update,
    SCOPES.core.tenant.members.read,
    SCOPES.core.tenant.billing.read,
  ],
  viewer: ALL_SCOPES.filter(
    (s) => s.startsWith(TENANT_PREFIX) && s.endsWith(':read'),
  ),
} as const satisfies Record<string, readonly Scope[]>

export type TenantRolePresetKey = keyof typeof TENANT_ROLE_PRESETS
export const TENANT_ROLE_PRESET_KEYS = Object.keys(
  TENANT_ROLE_PRESETS,
) as readonly TenantRolePresetKey[]

// ─── Preset detection helpers (for UI labels) ───────────────────────

function setsEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false
  const sb = new Set(b as readonly T[])
  return a.every((x) => sb.has(x))
}

/**
 * Reverse-lookup the staff role from a scope set. Returns `null`
 * when the set doesn't match any preset (= "Custom" in the UI).
 */
export function detectStaffPreset(
  scopes: readonly Scope[],
): StaffRoleKey | null {
  for (const key of STAFF_ROLES) {
    if (setsEqual(scopes, STAFF_ROLE_PRESETS[key])) return key
  }
  return null
}

/**
 * Same as `detectStaffPreset` but for tenant memberships. Returns
 * `null` for custom scope mixes.
 */
export function detectTenantPreset(
  scopes: readonly Scope[],
): TenantRolePresetKey | null {
  for (const key of TENANT_ROLE_PRESET_KEYS) {
    if (setsEqual(scopes, TENANT_ROLE_PRESETS[key])) return key
  }
  return null
}

/**
 * Type guard: is the value one of the staff role preset keys.
 */
export function isStaffRole(role: unknown): role is StaffRoleKey {
  return typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role)
}

/**
 * Statement type alias — useful for typing AC introspection on the
 * admin Access page.
 */
export type Statement = typeof statement
