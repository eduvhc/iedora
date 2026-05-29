'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRestaurantBySlug } from '@iedora/product-menu/features/auth'
import { markRestaurantOnboardingComplete } from '@iedora/product-menu/features/menu-onboarding'
import { signInUrl } from '@iedora/product-core/url'
import { publicUrl } from '@iedora/product-menu/shared/url'

/**
 * Mark the restaurant's onboarding wizard as completed (whether the
 * operator hit Skip or the AI-import finished). Without this row
 * write, navigating back from this step lands on `/menu/onboarding`
 * with the resume gate firing and pushing the user right back into
 * step 2 forever.
 *
 * Idempotent: re-runs on an already-completed row simply overwrite
 * the timestamp. The guard re-asserts tenancy
 * (`requireRestaurantBySlug`) so a forged slug from another tenant
 * can't flip the flag.
 */
export async function markMenuOnboardingComplete(input: {
  slug: string
}): Promise<void> {
  try {
    await requireRestaurantBySlug(input.slug)
  } catch {
    redirect(signInUrl(publicUrl('/menu/dashboard').toString()))
  }
  await markRestaurantOnboardingComplete(input.slug)
  revalidatePath('/menu/onboarding')
  revalidatePath('/menu/dashboard')
}
