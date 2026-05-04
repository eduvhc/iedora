import { expect, test } from '@playwright/test'
import {
  apiCreateAndActivateOrg,
  apiSignin,
  apiSignout,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../helpers/auth'

test.describe('Re-login uses DAL fallback for active organization', () => {
  test('a fresh session without activeOrganizationId still lands on /dashboard', async ({
    page,
  }) => {
    // Setup: user with an org from a previous "session"
    const user = uniqueUser('relogin')
    await apiSignup(page.request, user)
    await apiCreateAndActivateOrg(
      page.request,
      'Relogin Bistro',
      uniqueSlug('relogin'),
    )

    // Logout — drops the cookie + invalidates the session row in DB
    await apiSignout(page.request)

    // Sign back in — Better Auth creates a NEW session with activeOrganizationId=null.
    // The DAL must fall back to the user's first membership to avoid an onboarding loop.
    await apiSignin(page.request, user)

    await page.goto('/')
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByText('Relogin Bistro')).toBeVisible()
  })

  test('logout from the dashboard returns the user to /login', async ({
    page,
  }) => {
    await apiSignup(page.request, uniqueUser('logout-ui'))
    await apiCreateAndActivateOrg(
      page.request,
      'Logout Bistro',
      uniqueSlug('logout'),
    )

    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Restaurants' })).toBeVisible()

    await page.getByRole('button', { name: 'Log out' }).click()
    await page.waitForURL('**/login')

    // Going back to /dashboard now should redirect to /login
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/)
  })
})
