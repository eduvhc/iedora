import postgres from 'postgres'

/**
 * Suite-wide hygiene before any spec runs. Truncates every table under
 * every product schema using the `MENU_DATABASE_URL` connection — the
 * test database is a single Postgres instance hosting `menu`, and
 * future product schemas, in the same DB.
 *
 * `core_test` (better-auth tables) is reset separately by the
 * `globalSetupCore` hook on demand from admin specs; it is NOT cleared
 * here because most suites need a stable iedora-admin to be present
 * for the duration.
 *
 * Adding a product = append its schema to `PRODUCT_SCHEMAS`. Tables
 * are discovered at runtime so new tables can never silently skip
 * cleanup.
 */

const PRODUCT_SCHEMAS = ['menu'] as const

export default async function globalSetup() {
  const url =
    process.env.MENU_DATABASE_URL ??
    'postgresql://postgres:Password1!@localhost:5432/menu_test'
  const sql = postgres(url, { max: 1 })
  try {
    for (const schema of PRODUCT_SCHEMAS) {
      const rows = await sql<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = ${schema}
      `
      if (rows.length === 0) continue
      const idents = rows
        .map((r) => `"${schema}"."${r.tablename}"`)
        .join(', ')
      await sql.unsafe(
        `TRUNCATE TABLE ${idents} RESTART IDENTITY CASCADE`,
      )
    }
  } catch (err) {
    console.warn(
      '[e2e global-setup] truncation failed (likely DB not migrated):',
      err,
    )
  } finally {
    await sql.end({ timeout: 5 })
  }
}
