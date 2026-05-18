import { expect, test } from '../../fixtures'
import { testDb } from '../../helpers/db'

test.describe('Onboarding — first restaurant', () => {
  test('creates org on genkan + restaurant in menu DB + redirects to /dashboard', async ({
    signedInPage,
  }) => {
    const restaurantName = 'Casa Test'
    const slug = `casa-test-${Date.now().toString(36)}`

    await signedInPage.goto('/onboarding')
    await expect(signedInPage.getByText('Create your first restaurant')).toBeVisible()

    await signedInPage.getByLabel('Restaurant name').fill(restaurantName)
    await signedInPage.getByLabel(/URL slug/i).fill(slug)
    await signedInPage.getByRole('button', { name: /Create restaurant/i }).click()

    // After success, the action redirects to /dashboard.
    await signedInPage.waitForURL(/\/dashboard(\?|$)/, { timeout: 15_000 })

    // The restaurant row exists in menu's DB with a genkan-issued org id.
    const sql = testDb()
    const rows = await sql<
      { id: string; organization_id: string; slug: string; name: string }[]
    >`
      SELECT id, organization_id, slug, name
      FROM "menu"."restaurant"
      WHERE slug = ${slug}
      LIMIT 1
    `
    expect(rows.length).toBe(1)
    expect(rows[0]!.name).toBe(restaurantName)
    // organization_id is a non-empty UUID-shaped string handed back by the
    // testkit-shim's create-organization endpoint. The exact format is
    // genkan's choice (Better Auth's `generateId`); just check it's set.
    expect(rows[0]!.organization_id.length).toBeGreaterThan(8)
  })
})
