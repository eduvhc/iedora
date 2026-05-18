import { expect, test } from '../../fixtures'
import { seedMenu, seedRestaurant, testDb } from '../../helpers/db'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Public menu — i18n', () => {
  test('?lang=pt shows the Portuguese override, ?lang=en falls back to source', async ({
    page,
    signInNewUser,
    seedOrg,
  }) => {
    const { context, user } = await signInNewUser('i18n')
    const org = await seedOrg({
      name: 'I18n Bistro',
      slug: `i18n-${Date.now().toString(36)}`,
      ownerId: user.userId,
    })

    // Restaurant configured with both EN and PT.
    const sql = testDb()
    const { restaurantId } = await seedRestaurant(
      org.id,
      'I18n Bistro',
      org.slug,
    )
    await sql`
      UPDATE "menu"."restaurant"
        SET default_language = 'en',
            supported_languages = ${sql.json(['en', 'pt'])}
      WHERE id = ${restaurantId}
    `
    const { menuId } = await seedMenu(restaurantId, 'Main')
    const [catRow] = await sql<{ id: string }[]>`
      INSERT INTO "menu"."category" (id, menu_id, restaurant_id, name, position, updated_at)
      VALUES (gen_random_uuid()::text, ${menuId}, ${restaurantId}, 'Fish', 0, now())
      RETURNING id
    `
    const categoryId = catRow!.id
    await sql`
      INSERT INTO "menu"."item" (
        id, category_id, restaurant_id, name, name_i18n,
        price_cents, currency, position, updated_at
      )
      VALUES (
        gen_random_uuid()::text,
        ${categoryId},
        ${restaurantId},
        'Cod',
        ${sql.json({ pt: 'Bacalhau' })},
        1200,
        'EUR',
        0,
        now()
      )
    `

    // PT route: shows the override.
    await page.goto(`/r/${org.slug}?lang=pt`)
    await expect(page.getByText('Bacalhau')).toBeVisible()
    await expect(page.getByText('Cod')).toHaveCount(0)

    // EN route: source name.
    await page.goto(`/r/${org.slug}?lang=en`)
    await expect(page.getByText('Cod')).toBeVisible()
    await expect(page.getByText('Bacalhau')).toHaveCount(0)

    // ES not supported on this restaurant; fallback to default language (EN).
    await page.goto(`/r/${org.slug}?lang=es`)
    await expect(page.getByText('Cod')).toBeVisible()

    await context.close()
  })
})
