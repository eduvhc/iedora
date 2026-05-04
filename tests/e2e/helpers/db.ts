import postgres from 'postgres'

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/metamenu_test'

let _sql: ReturnType<typeof postgres> | null = null

export function testDb() {
  if (!_sql) _sql = postgres(TEST_URL, { max: 4 })
  return _sql
}

export async function truncateAll() {
  const sql = testDb()
  await sql`
    TRUNCATE TABLE
      "item", "category", "menu", "restaurant",
      "invitation", "member", "organization",
      "session", "account", "verification", "user"
    RESTART IDENTITY CASCADE
  `
}
