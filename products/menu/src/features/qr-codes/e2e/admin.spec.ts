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
 * and `data-test-id` (resolved via `getByTestId`) for compound widgets
 * and rows.
 */

test.describe('@smoke qr-codes admin', () => {
  test('renders both creation forms and the registry', async ({ signedInPage }) => {
    await signedInPage.goto(qrCodesRoutes.admin)
    await expect(signedInPage.locator('h1')).toContainText('QR codes (admin)')

    await expect(signedInPage.getByTestId('qr-codes-create-panel')).toBeVisible()
    await expect(signedInPage.locator('#qr-code')).toBeVisible()
    await expect(signedInPage.locator('#qr-bulk-count')).toBeVisible()
    await expect(signedInPage.getByTestId('qr-codes-registry')).toBeVisible()
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
    // #qr-restaurant is a Combobox button (Manual § VI.4) — open the
    // popover, then click the option. Options are id'd by their value
    // (see packages/design-system/src/components/combobox.tsx).
    await page.locator('#qr-restaurant').click()
    await page.locator(`#ds-combobox-opt-${sushi.restaurantId}`).click()
    await page.getByTestId('qr-codes-create-one-submit').click()

    const row = page.getByTestId('qr-codes-row-sticker_sushi_10')
    await expect(row).toBeVisible()
    await expect(row).toContainText('Sushi Table 10')
    // The row's Combobox renders the selected label inside an
    // `<input value>` — `toContainText()` doesn't read input values, so
    // assert via `toHaveValue` on the combobox input directly. The alias
    // link in the URL column encodes the restaurant slug; check both so
    // a regression in either surface is caught.
    await expect(
      row.getByTestId('qr-codes-row-bind-sticker_sushi_10'),
    ).toHaveValue('Sushi Express')
    await expect(
      row.getByTestId('qr-codes-row-alias-sticker_sushi_10'),
    ).toContainText('sushi-express')
  })

  test('bulk-generates unbound codes', async ({ signedInPage }) => {
    await signedInPage.goto(qrCodesRoutes.admin)
    await signedInPage.locator('#qr-bulk-count').fill('5')
    await signedInPage.getByTestId('qr-codes-bulk-submit').click()

    // Bulk no longer renders the code list inline — confirmation is a
    // mono-caps line; the codes flow into the registry table below
    // when the action's revalidate completes.
    await expect(signedInPage.getByTestId('qr-codes-bulk-success')).toContainText(
      'Generated 5',
    )
    const registry = signedInPage.getByTestId('qr-codes-registry')
    await expect(registry.locator('tbody > tr')).toHaveCount(5)
  })

  // Narrow viewport — the create panel collapses to a single column, the
  // registry table becomes horizontally scrollable. The header row stays
  // out of view; row cells are still reachable via scroll.
  test('remains usable at phone width', async ({ signedInPage }) => {
    await signedInPage.setViewportSize({ width: 390, height: 844 })
    await signedInPage.goto(qrCodesRoutes.admin)

    // Create panel is visible and both forms render in the column flow.
    await expect(signedInPage.getByTestId('qr-codes-create-panel')).toBeVisible()
    const createPanel = signedInPage.getByTestId('qr-codes-create-panel')
    const singleForm = createPanel.getByTestId('qr-codes-create-one-form')
    const bulkForm = createPanel.getByTestId('qr-codes-bulk-form')
    await expect(singleForm).toBeVisible()
    await expect(bulkForm).toBeVisible()

    // Submit button reachable: scroll it into the viewport, then assert.
    const submit = signedInPage.getByTestId('qr-codes-create-one-submit')
    await submit.scrollIntoViewIfNeeded()
    await expect(submit).toBeVisible()

    // Registry table sits inside an overflow-x container; the inner table
    // exceeds the viewport so the wrapper must be scrollable. Verify by
    // measuring the scroll width vs client width.
    const tableScroll = await signedInPage.evaluate(() => {
      const wrap = document.querySelector(
        '[data-test-id="qr-codes-registry"] .overflow-x-auto',
      ) as HTMLElement | null
      if (!wrap) return null
      return { scrollWidth: wrap.scrollWidth, clientWidth: wrap.clientWidth }
    })
    // Empty registries skip the wrapper — guard against null. If it
    // exists, the scroll width must exceed the visible width.
    if (tableScroll) {
      expect(tableScroll.scrollWidth).toBeGreaterThan(tableScroll.clientWidth)
    }
  })
})
