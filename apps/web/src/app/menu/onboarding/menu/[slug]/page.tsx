import { requireRestaurantBySlug } from '@iedora/product-menu/features/auth'
import { MenuOnboardingPage } from '@iedora/product-menu/features/menu-onboarding'
import { canGenerateAiMenu } from '@iedora/product-menu/features/plans'
import { markMenuOnboardingComplete } from './actions'

/**
 * Step 2 of onboarding — AI menu setup. Auth-gates by slug (the
 * caller arrived here from `completeOnboarding` so they own this
 * restaurant; the guard re-verifies on every request anyway so a
 * stale URL drops to `/dashboard`).
 *
 * The slice's `<MenuOnboardingPage>` owns the layout, eyebrow, and
 * the wizard + skip composition. This file is a thin server entry +
 * a quota pre-fetch so the operator sees their weekly allowance
 * before they pick a photo.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { restaurant, tenantId } = await requireRestaurantBySlug(slug)
  const gate = await canGenerateAiMenu(tenantId)

  // Bind the slug into a server-action closure the wizard can call
  // from a client-side completion handler. Keeps the slice free of
  // any direct DB import.
  async function onComplete() {
    'use server'
    await markMenuOnboardingComplete({ slug: restaurant.slug })
  }

  return (
    <MenuOnboardingPage
      slug={restaurant.slug}
      restaurantId={restaurant.id}
      initialQuota={{ used: gate.used, limit: gate.limit }}
      onComplete={onComplete}
    />
  )
}
