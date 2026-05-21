import { test, expect } from '../../../../tests/e2e/fixtures'
import { qrCodesAdminProfile, qrCodesRoutes } from '../testing'
import { seedOrg, bindUserToOrg } from '@/features/identity/testing'
import { seedRestaurant } from '@/features/restaurant-identity/testing'

/**
 * QR-codes admin specs — owned by the qr-codes slice. Each spec signs
 * in with `qrCodesAdminProfile` (the slice's own profile, re-exporting
 * `iedoraAdminProfile`). Route strings come from `qrCodesRoutes`.
 *
 * Selectors lean on stable IDs (`#qr-code`, `#qr-label`, `#qr-restaurant`)
 * and exact text matches where the layout uses generic words like "Single".
 */

test.describe('@smoke qr-codes admin', () => {
  test('renders the two creation cards', async ({ signedInPage }) => {
    await signedInPage.goto(qrCodesRoutes.admin)
    await expect(signedInPage.locator('h1')).toContainText('QR codes (admin)')

    // Stable IDs prove both cards are rendered.
    await expect(signedInPage.locator('#qr-code')).toBeVisible()
    await expect(signedInPage.locator('#qr-bulk-count')).toBeVisible()
  })

  test('binds a fresh QR code to a seeded restaurant', async ({ signIn }) => {
    const org = seedOrg({ id: 'o1', name: 'Org One' })
    const sushi = await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Sushi Express',
      slug: 'sushi-express',
    })
    const { page, user } = await signIn({
      email: 'admin@iedora.test',
      name: 'Iedora Admin',
      profile: qrCodesAdminProfile,
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)

    await page.goto(qrCodesRoutes.admin)
    await page.locator('#qr-code').fill('sticker_sushi_10')
    await page.locator('#qr-label').fill('Sushi Table 10')
    await page.locator('#qr-restaurant').selectOption({ value: sushi.restaurantId })
    await page.locator('button:has-text("Create QR Code")').click()

    const row = page.locator('tr:has-text("sticker_sushi_10")')
    await expect(row).toBeVisible()
    await expect(row).toContainText('Sushi Table 10')
    await expect(row).toContainText('Sushi Express')
  })

  test('bulk-generates unbound codes', async ({ signedInPage }) => {
    await signedInPage.goto(qrCodesRoutes.admin)
    await signedInPage.locator('#qr-bulk-count').fill('5')
    await signedInPage.locator('button:has-text("Generate Batch")').click()

    const copyBlock = signedInPage.locator('div:has-text("Copy List")').first()
    await expect(copyBlock).toBeVisible()
    const text = await copyBlock.locator('pre').innerText()
    const codes = text.trim().split('\n')
    expect(codes.length).toBe(5)
    for (const code of codes) expect(code).toMatch(/^[a-z0-9_-]{8}$/)
  })
})
