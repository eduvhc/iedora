import { hasStaffScope, type StaffRoleKey } from './permissions'

/**
 * Centralised scope catalogue for every iedora product.
 *
 * Single file, indexed by product then kind. The const path mirrors
 * the way you ask "what can product X do?" — drill in by product
 * first, then by kind (staff vs tenant), then by resource/verb.
 *
 *   SCOPES.core.staff.users.impersonate   →  'staff:core:users:impersonate'
 *   SCOPES.core.staff.audit.read          →  'staff:core:audit:read'
 *   SCOPES.menu.tenant.qrCodes.read       →  'tenant:menu:qr-codes:read'
 *
 * Note the shape mismatch with the STRING (`<kind>:<product>:...`):
 * the const is product-first because that's how humans navigate
 * "give me product X's scopes"; the string stays kind-first because
 * `requireScope`/audit-log treat blast radius (staff vs tenant) as
 * the primary axis.
 *
 * Adding a scope:
 *   1. Add the verb to the relevant resource map below.
 *   2. Bind it on the role in `permissions.ts::statement` + the role
 *      definition (or rely on the wildcard for iedora-admin).
 *   3. The `Scope` union, `ALL_SCOPES`, and the admin Access page
 *      pick it up automatically.
 *
 * Framework-free: no `server-only`, no env, no Next imports. Safe
 * for client AND server.
 */

export const SCOPES = {
  // ── core: auth + admin surface ──────────────────────────────────
  core: {
    staff: {
      users: {
        read:        'staff:core:users:read',
        ban:         'staff:core:users:ban',
        setRole:     'staff:core:users:set-role',
        impersonate: 'staff:core:users:impersonate',
      },
      orgs: {
        list: 'staff:core:orgs:list',
        get:  'staff:core:orgs:get',
      },
      members: {
        remove:     'staff:core:members:remove',
        updateRole: 'staff:core:members:update-role',
      },
      invitations: {
        cancel: 'staff:core:invitations:cancel',
      },
      sessions: {
        list:   'staff:core:sessions:list',
        revoke: 'staff:core:sessions:revoke',
      },
      audit: {
        read: 'staff:core:audit:read',
      },
      admin: {
        // "May render the cross-tenant admin shell at all". Every
        // staff role holds it; tenant users don't.
        read: 'staff:core:admin:read',
      },
    },
    /**
     * Cross-tenant concerns that aren't product-specific (a tenant's
     * own member management + its billing + tenant lifecycle). Lives
     * under `core` because core owns the tenant + billing schemas.
     */
    tenant: {
      members: {
        read:   'tenant:core:members:read',
        invite: 'tenant:core:members:invite',
        remove: 'tenant:core:members:remove',
        // Edit another member's scopes (delegating authority within
        // the tenant). Owner-ish scope by default.
        grant:  'tenant:core:members:grant',
      },
      billing: {
        read:        'tenant:core:billing:read',
        // Granular billing verbs — split on blast radius. Today only
        // these three exist; add specific verbs (e.g. `cancel`) when
        // a surface needs them gated independently.
        changePlan:  'tenant:core:billing:change-plan',
        updatePayment: 'tenant:core:billing:update-payment',
      },
      tenant: {
        // Delete the whole tenant. Owner-only by convention.
        delete: 'tenant:core:tenant:delete',
      },
    },
  },

  // ── menu: restaurant SaaS ──────────────────────────────────────
  menu: {
    tenant: {
      restaurants: {
        read:   'tenant:menu:restaurants:read',
        create: 'tenant:menu:restaurants:create',
        update: 'tenant:menu:restaurants:update',
        delete: 'tenant:menu:restaurants:delete',
      },
      qrCodes: {
        read:   'tenant:menu:qr-codes:read',
        create: 'tenant:menu:qr-codes:create',
        update: 'tenant:menu:qr-codes:update',
        delete: 'tenant:menu:qr-codes:delete',
      },
    },
  },

  // ── imopush: realestate listings + portal distribution ─────────
  imopush: {
    tenant: {
      properties: {
        read:   'tenant:imopush:properties:read',
        create: 'tenant:imopush:properties:create',
        update: 'tenant:imopush:properties:update',
        delete: 'tenant:imopush:properties:delete',
      },
      idealista: {
        // Publish a property to Idealista. Standalone verb so an
        // operator like Mario can be granted publish-to-idealista
        // without write access to property data itself.
        publish: 'tenant:imopush:idealista:publish',
      },
    },
  },
} as const

/**
 * Flat union of every scope string declared. Derived from the
 * `SCOPES` tree so adding a leaf extends the union automatically.
 */
type LeafValues<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? LeafValues<T[keyof T]>
    : never
export type Scope = LeafValues<typeof SCOPES>

/**
 * Runtime flat list — same content as `Scope`, iterable. Used by
 * the admin Access page's introspection (`for scope of ALL_SCOPES`).
 */
function collectLeaves(node: unknown, out: string[]): void {
  if (typeof node === 'string') {
    out.push(node)
    return
  }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectLeaves(v, out)
  }
}
const _all: string[] = []
collectLeaves(SCOPES, _all)
export const ALL_SCOPES: ReadonlyArray<Scope> = _all as ReadonlyArray<Scope>

/**
 * Which scopes does a given staff role grant? Probes
 * `hasStaffScope` against every declared SCOPE — derived FROM the
 * AC binding, never duplicates the role definition. Used by the
 * admin Access page to render "what can role X do?" cards.
 *
 * Lives next to the catalogue so the cross-product probe is a
 * one-import operation. Imports `hasStaffScope` from `permissions`
 * via a local symbol because that module also re-uses
 * `scopeToPermission` defined there — circular-import safe because
 * both helpers are pure functions.
 */
export async function listAllowedScopes(
  roleKey: StaffRoleKey,
): Promise<ReadonlyArray<Scope>> {
  const allowed: Scope[] = []
  for (const scope of ALL_SCOPES) {
    if (await hasStaffScope(roleKey, scope)) allowed.push(scope)
  }
  return allowed
}

/**
 * i18n key for a scope's description, anchored under the `scopes.*`
 * sub-namespace. **Product-first** dotted path — mirrors the
 * `SCOPES` const shape so the i18n catalogue reads in the same
 * order callers think about it:
 *
 *   'staff:core:users:read'       →  'scopes.core.staff.users.read'
 *   'tenant:menu:qr-codes:read'   →  'scopes.menu.tenant.qr-codes.read'
 *
 * Note: the SCOPE STRING is kind-first (`<kind>:<product>:...`) for
 * AC reasons; the const + i18n key are product-first for human
 * navigation. This helper bridges the two.
 *
 * Convention: every consumer that displays scope descriptions nests
 * them under `scopes.*` inside its own next-intl namespace. Call
 * directly: `t(scopeI18nKey(scope))`.
 */
export function scopeI18nKey(scope: Scope): string {
  const { kind, product, resource, verb } = parseScope(scope)
  return `scopes.${product}.${kind}.${resource}.${verb}`
}

/**
 * Split a scope into its four segments. Mirror of the canonical
 * string format `<kind>:<product>:<resource>:<verb>`.
 */
export function parseScope(scope: Scope): {
  kind: string
  product: string
  resource: string
  verb: string
} {
  const parts = scope.split(':')
  if (parts.length !== 4) {
    throw new Error(`[iedora/auth] malformed scope ${scope}`)
  }
  const [kind, product, resource, verb] = parts as [
    string,
    string,
    string,
    string,
  ]
  return { kind, product, resource, verb }
}
