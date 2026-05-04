import { expect, test } from '@playwright/test'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../helpers/auth'

// Use page.request (not the standalone `request` fixture) so cookies set by
// signup carry over to the navigation that follows.

test.describe('Onboarding gating', () => {
  test('logged-in user without an org is sent to /onboarding from /dashboard', async ({
    page,
  }) => {
    await apiSignup(page.request, uniqueUser('no-org'))
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/onboarding$/)
    await expect(page.getByText('Create your first restaurant')).toBeVisible()
  })

  test('logged-in user with an active org is sent to /dashboard from /onboarding', async ({
    page,
  }) => {
    await apiSignup(page.request, uniqueUser('with-org'))
    await apiCreateAndActivateOrg(
      page.request,
      'Owned Bistro',
      uniqueSlug('owned'),
    )

    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Restaurants' })).toBeVisible()
  })

  test('GET / for a logged-in user with an org goes to /dashboard', async ({
    page,
  }) => {
    await apiSignup(page.request, uniqueUser('root'))
    await apiCreateAndActivateOrg(
      page.request,
      'Root Bistro',
      uniqueSlug('root'),
    )

    await page.goto('/')
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
