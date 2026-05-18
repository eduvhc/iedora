import postgres from 'postgres'

/**
 * Single Postgres client for menu's test DB. Helpers reuse it; the fixture
 * `resetMenu()` calls `truncateAll()`. The TEST_DATABASE_URL env var
 * override mirrors `menu_test` from global-setup.
 */

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/menu_test'

let _sql: ReturnType<typeof postgres> | null = null

export function testDb() {
  if (!_sql) _sql = postgres(TEST_URL, { max: 4 })
  return _sql
}

export async function closeTestDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 })
    _sql = null
  }
}

/**
 * TRUNCATE every menu-owned table between tests. Auth tables (`user`,
 * `session`, `account`, `verification`, `rateLimit`) live under `menu.*`
 * as a LOCAL cache of federated identity — flushed too so each test starts
 * with no stale Better Auth client rows.
 */
export async function truncateAll(): Promise<void> {
  const sql = testDb()
  await sql`
    TRUNCATE TABLE
      "menu"."view_seen", "menu"."daily_view", "menu"."invoice",
      "menu"."item", "menu"."category", "menu"."menu",
      "menu"."restaurant", "menu"."org_plan",
      "menu"."session", "menu"."account", "menu"."verification",
      "menu"."rate_limit", "menu"."rate_limit_event", "menu"."user"
    RESTART IDENTITY CASCADE
  `
}

/**
 * Inserts a restaurant under a known (genkan-issued) organizationId.
 * Tests use this AFTER seeding the org via the testkit; the FK is
 * Postgres-side absent (organizationId has no DB-level foreign key — see
 * schema comment) so menu doesn't need genkan reachable to insert.
 */
export async function seedRestaurant(
  organizationId: string,
  name: string,
  slug: string,
): Promise<{ restaurantId: string }> {
  const sql = testDb()
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO "menu"."restaurant" (id, organization_id, name, slug, updated_at)
    VALUES (
      gen_random_uuid()::text,
      ${organizationId},
      ${name},
      ${slug},
      now()
    )
    RETURNING id
  `
  return { restaurantId: row!.id }
}

export async function seedMenu(
  restaurantId: string,
  name: string,
  opts: { active?: boolean; position?: number } = {},
): Promise<{ menuId: string }> {
  const sql = testDb()
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO "menu"."menu" (id, restaurant_id, name, active, position, updated_at)
    VALUES (
      gen_random_uuid()::text,
      ${restaurantId},
      ${name},
      ${opts.active ?? true},
      ${opts.position ?? 0},
      now()
    )
    RETURNING id
  `
  return { menuId: row!.id }
}

export async function seedCategoryWithItems(
  menuId: string,
  restaurantId: string,
  categoryName: string,
  itemNames: string[],
): Promise<{ categoryId: string; itemIds: string[] }> {
  const sql = testDb()
  const [catRow] = await sql<{ id: string }[]>`
    INSERT INTO "menu"."category" (id, menu_id, restaurant_id, name, position, updated_at)
    VALUES (
      gen_random_uuid()::text,
      ${menuId},
      ${restaurantId},
      ${categoryName},
      0,
      now()
    )
    RETURNING id
  `
  const categoryId = catRow!.id

  const itemIds: string[] = []
  for (const [i, itemName] of itemNames.entries()) {
    const [itemRow] = await sql<{ id: string }[]>`
      INSERT INTO "menu"."item" (
        id, category_id, restaurant_id, name,
        price_cents, currency, position, updated_at
      )
      VALUES (
        gen_random_uuid()::text,
        ${categoryId},
        ${restaurantId},
        ${itemName},
        ${(i + 1) * 100},
        'EUR',
        ${i},
        now()
      )
      RETURNING id
    `
    itemIds.push(itemRow!.id)
  }

  return { categoryId, itemIds }
}
