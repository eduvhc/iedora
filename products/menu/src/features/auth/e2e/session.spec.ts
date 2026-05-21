import { test, expect } from '../../../../tests/e2e/fixtures'
import { signOut } from '../testing'
import { dashboardRoutes } from '@/features/dashboard-home/testing'

/**
 * Auth slice specs — exercise DAL guards' redirect behaviour and the
 * post-logout cookie clearing. The `signedInPage` fixture seals the
 * exact cookie production mints, so `/dashboard` must succeed without
 * an OIDC bounce. Unauthenticated requests must bounce — but we don't
 * pin the destination URL (the production code starts an OIDC flow
 * that ends up on the Zitadel shim's authorize endpoint), only that
 * the dashboard did NOT render.
 */

test.describe('@critical auth session', () => {
  test('signed-in user lands on the dashboard', async ({ signedInPage }) => {
    const res = await signedInPage.goto(dashboardRoutes.home)
    expect(res?.status()).toBeLessThan(400)
    expect(signedInPage.url()).toContain('/dashboard')
  })

  test('unauthenticated request is bounced off the dashboard', async ({ page }) => {
    const res = await page.goto(dashboardRoutes.home)
    // Whatever the destination (login route, OIDC authorize URL, etc.),
    // the test's safety property is "we did NOT render the dashboard".
    expect(page.url()).not.toContain(dashboardRoutes.home)
    expect(res?.status()).toBeLessThan(500)
  })

  test('signOut clears the cookie and forces re-auth', async ({ signIn }) => {
    const { context, page } = await signIn({
      email: 'logout@iedora.test',
      name: 'Logout User',
    })
    await page.goto(dashboardRoutes.home)
    expect(page.url()).toContain('/dashboard')

    await signOut(context)
    await page.goto(dashboardRoutes.home)
    expect(page.url()).not.toContain(dashboardRoutes.home)
  })
})
