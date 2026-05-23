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
    await expect(signedInPage.locator('h1')).toContainText('QR codes')

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
    await page.locator('#qr-restaurant').click()
    await page.locator(`#ds-combobox-opt-${sushi.restaurantId}`).click()
    await page.getByTestId('qr-codes-create-one-submit').click()

    const row = page.getByTestId('qr-codes-row-sticker_sushi_10')
    await expect(row).toBeVisible()
    // The row's label cell is now an `<input value>`, so assert via
    // toHaveValue (toContainText reads text nodes, not input values).
    await expect(
      row.getByTestId('qr-codes-row-label-sticker_sushi_10'),
    ).toHaveValue('Sushi Table 10')
    await expect(
      row.getByTestId('qr-codes-row-bind-sticker_sushi_10'),
    ).toHaveValue('Sushi Express')
    await expect(
      row.getByTestId('qr-codes-row-alias-sticker_sushi_10'),
    ).toContainText('sushi-express')
    // Created badge shows the relative date for the freshly-minted code.
    await expect(
      row.getByTestId('qr-codes-row-created-sticker_sushi_10'),
    ).toContainText('today')
  })

  test('inline label edit persists on blur', async ({ signIn }) => {
    const org = seedOrg({ id: 'o2', name: 'Org Two' })
    const { page, user } = await signIn({
      email: 'admin2@iedora.test',
      name: 'Iedora Admin Two',
      profile: qrCodesAdminProfile,
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)

    await page.goto(qrCodesRoutes.admin)
    await page.locator('#qr-code').fill('sticker_edit_1')
    await page.getByTestId('qr-codes-create-one-submit').click()

    const label = page.getByTestId('qr-codes-row-label-sticker_edit_1')
    await label.fill('Re-labelled inline')
    await label.blur()
    // The blur queues a server action via `startTransition`; without
    // waiting for it to settle, the reload below races the revalidate
    // and the label still reads empty. `toBeEnabled` auto-polls — the
    // input toggles `disabled` while the transition is pending and
    // returns to enabled once the action resolves.
    await expect(label).toBeEnabled()

    await page.reload()
    await expect(
      page.getByTestId('qr-codes-row-label-sticker_edit_1'),
    ).toHaveValue('Re-labelled inline')
  })

  test('bulk-generates unbound codes', async ({ signedInPage }) => {
    await signedInPage.goto(qrCodesRoutes.admin)
    await signedInPage.locator('#qr-bulk-count').fill('5')
    await signedInPage.getByTestId('qr-codes-bulk-submit').click()

    // Bulk no longer renders the code list inline — confirmation is a
    // mono-caps line; the codes flow into the registry list below when
    // the action's revalidate completes.
    await expect(signedInPage.getByTestId('qr-codes-bulk-success')).toContainText(
      'Generated 5',
    )
    const registry = signedInPage.getByTestId('qr-codes-registry-list')
    await expect(registry.locator('> li')).toHaveCount(5)
  })

  // Mobile-first contract — the row collapses to a single column at
  // phone widths and never demands horizontal scrolling.
  test('remains usable at phone width', async ({ signedInPage }) => {
    await signedInPage.setViewportSize({ width: 390, height: 844 })
    await signedInPage.goto(qrCodesRoutes.admin)

    await expect(signedInPage.getByTestId('qr-codes-create-panel')).toBeVisible()
    const createPanel = signedInPage.getByTestId('qr-codes-create-panel')
    await expect(createPanel.getByTestId('qr-codes-create-one-form')).toBeVisible()
    await expect(createPanel.getByTestId('qr-codes-bulk-form')).toBeVisible()

    const submit = signedInPage.getByTestId('qr-codes-create-one-submit')
    await submit.scrollIntoViewIfNeeded()
    await expect(submit).toBeVisible()

    // The page itself must not overflow horizontally — the registry is
    // a flowed list now, not an overflow-x table.
    const overflow = await signedInPage.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client)
  })
})
