'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/features/auth/adapters/better-auth-instance'
import { getEffectiveOrganizationId } from '@/features/auth'
import {
  createOrganization,
  setActiveOrganization,
} from '@/features/identity'
import { GENKAN_URL } from '@/shared/brand'
import { db } from '@/shared/db/client'
import { menu, restaurant } from '@/shared/db/schema'
import { canAddRestaurant } from '@/features/plans'
import { enforceRateLimit } from '@/features/rate-limit'

const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

const onboardingSchema = z.object({
  restaurantName: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugRegex, 'Use lowercase letters, numbers, and hyphens (2-40 chars)'),
})

export type OnboardingFormState =
  | { error?: string; fieldErrors?: Partial<Record<keyof z.infer<typeof onboardingSchema>, string>> }
  | undefined

/** The tx handle Drizzle yields to its callback. Inferred so we don't drag in
 *  the upstream generics every time we want a typed transactional helper. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function insertRestaurantWithDefaultMenu(
  tx: Tx,
  organizationId: string,
  restaurantName: string,
  slug: string,
): Promise<void> {
  const [created] = await tx
    .insert(restaurant)
    .values({ organizationId, name: restaurantName, slug })
    .returning({ id: restaurant.id })
  if (!created) throw new Error('onboarding: restaurant insert returned no rows')

  await tx.insert(menu).values({
    restaurantId: created.id,
    name: 'Main menu',
    position: 0,
  })
}

export async function completeOnboarding(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const parsed = onboardingSchema.safeParse({
    restaurantName: formData.get('restaurantName'),
    slug: formData.get('slug'),
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { fieldErrors }
  }

  const { restaurantName, slug } = parsed.data
  const reqHeaders = await headers()

  const session = await auth.api.getSession({ headers: reqHeaders })
  if (!session?.user) redirect(`${GENKAN_URL}/login`)

  // Throttle per-user — org doesn't exist yet on first call. Fail-open by
  // policy (cosmetic UX gate, not a brute-force surface).
  const decision = await enforceRateLimit('onboarding', `user:${session.user.id}`)
  if (!decision.ok) {
    return { error: `Too many attempts. Try again in ${decision.retryAfterSec}s.` }
  }

  // Existing org? Add the restaurant under it (gated by plan limit). Brand-new
  // user? Create org on Genkan + first restaurant locally. Plans are scoped
  // to the org so the `+ new restaurant` flow on the dashboard makes the
  // gate meaningful — every restaurant lives under a single tenant rather
  // than spawning a fresh one.
  const existingOrgId = await getEffectiveOrganizationId(session.user.id)

  if (existingOrgId) {
    const gate = await canAddRestaurant(existingOrgId)
    if (!gate.ok) {
      return {
        error: `Your plan allows ${gate.limit} restaurant${gate.limit === 1 ? '' : 's'}. Upgrade to Casa to add more.`,
      }
    }
    return addRestaurantToOrg(existingOrgId, restaurantName, slug)
  }

  return createOrgAndFirstRestaurant(session.user.id, restaurantName, slug)
}

async function addRestaurantToOrg(
  organizationId: string,
  restaurantName: string,
  slug: string,
): Promise<OnboardingFormState> {
  try {
    await db.transaction((tx) =>
      insertRestaurantWithDefaultMenu(tx, organizationId, restaurantName, slug),
    )
  } catch (err) {
    console.error('[onboarding] restaurant creation under existing org failed', err)
    return { error: 'Could not create restaurant. The slug may already be taken.' }
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

async function createOrgAndFirstRestaurant(
  userId: string,
  restaurantName: string,
  slug: string,
): Promise<OnboardingFormState> {
  // Create the org on Genkan first — it owns the canonical record, mints
  // the owner membership, and returns the UUID we'll stash on the
  // restaurant row. If this fails we surface a generic error; we don't
  // need to roll anything back since nothing local was written yet.
  const orgResult = await createOrganization(userId, restaurantName, slug)
  if (!orgResult.ok) {
    return { error: 'Could not create organization. Slug may already be taken.' }
  }
  const organization = orgResult.organization

  // Set this as the user's active organization on Genkan so subsequent
  // calls to `listOrganizations` resolve it first. Best-effort — a failure
  // here is recoverable on next sign-in.
  await setActiveOrganization(userId, organization.id).catch(() => false)

  // Restaurant + default menu must commit together; if the transaction
  // fails (migration, FK, etc.) we surface a generic error. Genkan-side
  // cleanup of the org would be a follow-up call — for now we accept the
  // tiny eventual-consistency risk (orphan empty org on the IdaaS that
  // the user can use again next time onboarding is re-run with a
  // different slug). The previous local-transaction-rollback-of-the-auth-
  // org no longer makes sense across two databases.
  try {
    await db.transaction((tx) =>
      insertRestaurantWithDefaultMenu(tx, organization.id, restaurantName, slug),
    )
  } catch (err) {
    console.error('[onboarding] restaurant creation failed', err)
    return { error: 'Could not create restaurant. Please try again.' }
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
