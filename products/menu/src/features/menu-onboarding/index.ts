/**
 * Public API of the menu-onboarding slice.
 *
 * The heavy lifting (AI parse + menu write) lives in `menu-import`;
 * this slice orchestrates the post-signup composition and owns the
 * two small read/write helpers around `restaurant.onboarding_completed_at`
 * — the flag the `/menu/onboarding` resume gate reads to decide
 * whether to bounce the operator back into step 2.
 */

export { MenuOnboardingPage } from './ui/menu-onboarding-page'
export { findPendingOnboardingRestaurant } from './use-cases/find-pending-restaurant'
export { markRestaurantOnboardingComplete } from './use-cases/mark-complete'
