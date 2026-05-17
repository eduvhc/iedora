import { getTestkitUrl } from './testkit'

/**
 * Convenience seed helpers — thin HTTP wrappers around the testkit (or the
 * shim's test-only helpers). Specs use these to build their fixture state
 * without reaching into the bootstrap process directly.
 */

export type SeededOrg = {
  id: string
  slug: string
  name: string
}

/**
 * Create a user. Returns the user id Better Auth assigned — the same id
 * winds up in menu's `user` table after `signInAs`.
 */
export async function seedUser(opts: {
  email: string
  name: string
  password?: string
}): Promise<{ id: string; email: string }> {
  const url = getTestkitUrl()
  const password = opts.password ?? 'correct-horse-battery-staple'
  const res = await fetch(`${url}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: url },
    body: JSON.stringify({ name: opts.name, email: opts.email, password }),
  })
  if (res.ok) {
    const json = (await res.json()) as { user: { id: string; email: string } }
    return { id: json.user.id, email: json.user.email }
  }
  // Email already taken → look up the id via the shim helper.
  const find = await fetch(
    `${url}/_test/find-user-id?email=${encodeURIComponent(opts.email)}`,
  )
  if (!find.ok) {
    throw new Error(
      `seedUser: signUp failed ${res.status}, lookup failed ${find.status}`,
    )
  }
  const data = (await find.json()) as { id: string | null }
  if (!data.id) throw new Error(`seedUser: no user for ${opts.email}`)
  return { id: data.id, email: opts.email }
}

/**
 * Create an organization on genkan-testkit with the given user as owner.
 * Hits the shim's bearer-aware `/api/identity/organization/create` route
 * (mirrors genkan's production endpoint), which then forwards the call to
 * Better Auth's "system action" path (createOrganization with userId in
 * the body). Bearer is minted from `signTestToken` so the shim authorises
 * as `ownerId`.
 */
export async function seedOrg(opts: {
  name: string
  slug: string
  ownerId: string
}): Promise<SeededOrg> {
  const url = getTestkitUrl()

  // Get an access token bound to the owner.
  const tokenRes = await fetch(`${url}/_test/sign-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: opts.ownerId,
      scopes: ['org:admin'],
    }),
  })
  if (!tokenRes.ok) {
    throw new Error(`seedOrg: token mint failed ${tokenRes.status}`)
  }
  const { token } = (await tokenRes.json()) as { token: string }

  const res = await fetch(`${url}/api/identity/organization/create`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      origin: url,
    },
    body: JSON.stringify({ name: opts.name, slug: opts.slug }),
  })
  if (!res.ok) {
    throw new Error(
      `seedOrg: create failed ${res.status} ${await res.text()}`,
    )
  }
  const json = (await res.json()) as {
    id?: string
    slug?: string
    name?: string
  }
  if (!json.id || !json.slug) {
    throw new Error(`seedOrg: unexpected shape ${JSON.stringify(json)}`)
  }
  return { id: json.id, slug: json.slug, name: json.name ?? opts.name }
}

/**
 * Add an existing user as a member of an existing org. Uses the shim's
 * `/_test/seed-member` test-only helper which dispatches to the testkit's
 * `seed.member` (Better Auth's `addMember` API).
 */
export async function seedMember(opts: {
  orgId: string
  userId: string
  role?: 'owner' | 'admin' | 'member'
}): Promise<void> {
  const url = getTestkitUrl()
  const res = await fetch(`${url}/_test/seed-member`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      orgId: opts.orgId,
      userId: opts.userId,
      role: opts.role ?? 'member',
    }),
  })
  if (!res.ok) {
    throw new Error(
      `seedMember: failed ${res.status} ${await res.text()}`,
    )
  }
}

let counter = 0
export function uniqueUser(label = 'user'): {
  email: string
  name: string
  password: string
} {
  counter += 1
  const stamp = `${Date.now()}-${counter}`
  return {
    email: `e2e-${label}-${stamp}@iedora.test`,
    name: `E2E ${label} ${counter}`,
    password: 'Password123!',
  }
}

export function uniqueSlug(prefix = 'r'): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`.toLowerCase()
}
