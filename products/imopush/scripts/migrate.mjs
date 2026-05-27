/**
 * Applies imopush's Drizzle migrations against the `imopush` Postgres
 * database. Real work lives in @iedora/db/scripts/run-migrations — this
 * file just picks the env var, computes the migrations folder path, and
 * supplies the schema + lock name.
 *
 * Runs in three places:
 *   1. CI — apps/web/scripts/migrate-test.mjs spawns it before e2e build.
 *   2. local dev — bin/dev-stack step 2.
 *   3. prod — Stage 3 of the deploy pipeline (`bin/iedora app`), against
 *      Hetzner Postgres before the app container hot-swap.
 */

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runMigrations } from '@iedora/db/scripts/run-migrations'

const url = process.env.IMOPUSH_DATABASE_URL
if (!url) {
  console.error('IMOPUSH_DATABASE_URL is not set')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))

try {
  await runMigrations({
    databaseUrl: url,
    migrationsFolder: join(here, '..', 'drizzle'),
    migrationsSchema: 'imopush',
    lockName: 'iedora-imopush-migrate',
    label: 'imopush',
  })
} catch (err) {
  console.error('[migrate:imopush] failed:', err)
  process.exit(1)
}
