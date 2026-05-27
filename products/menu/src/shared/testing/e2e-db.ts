import 'server-only'
import postgres, { type Sql } from 'postgres'

/**
 * Zero-domain Postgres helpers for the menu slice's E2E surface.
 * Nothing here knows what `restaurant` or `daily_view` means — every
 * domain seed lives in the owning slice's `testing/seeds.ts`. The
 * only Postgres-level knowledge encoded here is the schema name
 * (`menu`); `truncateAll` discovers tables at runtime so newly-added
 * tables can never silently skip cleanup.
 *
 * Suite-wide setup/teardown lives in `apps/web/tests/e2e/`. Specs and
 * slice seeds use the helpers here; the global hooks call only into
 * the schema-agnostic helpers under `apps/web/src/shared/testing/`.
 */

const DEFAULT_URL =
  'postgresql://postgres:Password1!@localhost:5432/menu_test'

const SCHEMA = 'menu'

export function workerDatabaseUrl(workerIndex = workerIndexFromEnv()): string {
  const base = process.env.MENU_DATABASE_URL ?? DEFAULT_URL
  if (process.env.E2E_ISOLATE_WORKERS !== '1') return base
  const u = new URL(base)
  u.pathname = `${u.pathname}_w${workerIndex}`
  return u.toString()
}

let _sql: Sql | null = null

export function testDb(): Sql {
  if (!_sql) _sql = postgres(workerDatabaseUrl(), { max: 4 })
  return _sql
}

export async function closeTestDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 })
    _sql = null
  }
}

export async function truncateAll(sql: Sql = testDb()): Promise<void> {
  const rows = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = ${SCHEMA}
  `
  if (rows.length === 0) return
  const idents = rows.map((r) => `"${SCHEMA}"."${r.tablename}"`).join(', ')
  await sql.unsafe(`TRUNCATE TABLE ${idents} RESTART IDENTITY CASCADE`)
}

function workerIndexFromEnv(): number {
  const raw = process.env.TEST_WORKER_INDEX
  if (!raw) return 0
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
