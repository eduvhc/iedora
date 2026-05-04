import { expect, test, request as playwrightRequest } from '@playwright/test'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../helpers/auth'

test.describe('Tenant isolation between organizations', () => {
  test('user A only sees their own restaurants on /dashboard', async ({
    request,
    browser,
  }) => {
    // Two independent contexts so each user has their own cookie jar.
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const reqA = ctxA.request
    const reqB = ctxB.request

    // User A → "Alpha Bistro"
    await apiSignup(reqA, uniqueUser('alpha'))
    const orgA = await apiCreateAndActivateOrg(reqA, 'Alpha Bistro', uniqueSlug('alpha'))

    // User B → "Beta Bistro"
    await apiSignup(reqB, uniqueUser('beta'))
    const orgB = await apiCreateAndActivateOrg(reqB, 'Beta Bistro', uniqueSlug('beta'))

    expect(orgA.id).not.toEqual(orgB.id)

    // A's dashboard shows Alpha but NOT Beta
    const pageA = await ctxA.newPage()
    await pageA.goto('/dashboard')
    await expect(pageA.getByText('Alpha Bistro')).toBeVisible()
    await expect(pageA.getByText('Beta Bistro')).toHaveCount(0)

    // B's dashboard shows Beta but NOT Alpha
    const pageB = await ctxB.newPage()
    await pageB.goto('/dashboard')
    await expect(pageB.getByText('Beta Bistro')).toBeVisible()
    await expect(pageB.getByText('Alpha Bistro')).toHaveCount(0)

    await ctxA.close()
    await ctxB.close()
  })

  test('a user cannot activate someone else\'s organization via the API', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()

    await apiSignup(ctxA.request, uniqueUser('a-only'))
    const orgA = await apiCreateAndActivateOrg(
      ctxA.request,
      'A-Only Bistro',
      uniqueSlug('aonly'),
    )

    await apiSignup(ctxB.request, uniqueUser('b-trying'))

    // B tries to set A's organization as active → must be forbidden
    const res = await ctxB.request.post('/api/auth/organization/set-active', {
      data: { organizationId: orgA.id },
    })
    expect(res.ok()).toBe(false)
    expect([400, 401, 403, 404]).toContain(res.status())

    await ctxA.close()
    await ctxB.close()
  })
})
