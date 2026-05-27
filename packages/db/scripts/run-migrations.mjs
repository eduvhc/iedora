/**
 * Generic Drizzle migration runner — the only path every product should
 * use to apply migrations, in any environment (dev, CI, prod).
 *
 * Why not `drizzle-kit migrate` directly:
 *   - It swallows errors. A schema collision exits 1 with no output;
 *     a connection drop looks identical to a SQL syntax error.
 *   - It has no hook for advisory locks. Two replicas racing on migrate()
 *     corrupt `__drizzle_migrations` without one (drizzle-orm#874).
 *   - It runs as a subprocess, so observability + logging are surface-level.
 *
 * This helper:
 *   1. Ensures the target database exists (CREATE DATABASE IF NOT EXISTS
 *      via the postgres admin DB). Idempotent.
 *   2. Pre-creates the target pg-schema (CREATE SCHEMA IF NOT EXISTS).
 *      This sidesteps the drizzle-kit 0.31+ behaviour where the
 *      migration's `CREATE SCHEMA <name>` clashes with the schema
 *      drizzle-kit pre-creates for its own `__drizzle_migrations` table.
 *   3. Acquires a `pg_advisory_lock` keyed on a crc32 of `lockName`.
 *      Two concurrent migrate runs on different replicas wait on the
 *      lock instead of corrupting state.
 *   4. Runs drizzle's programmatic `migrate()` with the supplied folder.
 *   5. Releases the lock + closes the connection.
 *   6. Flushes OTel traces/metrics so short-lived script processes don't
 *      lose telemetry on exit (the BatchSpanProcessor's default 5s cycle
 *      is longer than a typical migration run).
 *
 * Throws (rejects) on any failure with the original error preserved —
 * callers should let the rejection propagate so the process exits 1
 * with a useful stack trace. Never swallow.
 *
 * Observability surface (emitted only when OTEL_EXPORTER_OTLP_ENDPOINT
 * is set; otherwise the calls are global no-ops):
 *
 *   Spans (scope: `iedora`):
 *     migrate.run              — root span, attrs db.name + db.schema + lock.name
 *       migrate.ensure_db
 *       migrate.ensure_schema
 *       migrate.acquire_lock
 *       migrate.apply          — the drizzle migrate() call itself
 *
 *   Metrics (scope: `iedora`):
 *     iedora.migrations_total{schema, outcome=ok|fail}  — Counter
 *     iedora.migration_duration_ms{schema}              — Histogram
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import {
  registerIedoraOtel,
  shutdownIedoraOtel,
  tracer,
  meter,
} from '@iedora/observability'

// ─── OTel registration ─────────────────────────────────────────────
// `registerIedoraOtel` is idempotent — second call is a no-op. Safe to
// invoke at module load so the spans we create below have a real
// provider underneath them. Service name is migration-specific so the
// signal is distinguishable from the app's own traces in OO.
//
// If OTEL_EXPORTER_OTLP_ENDPOINT isn't set (dev without a collector,
// some CI paths), the call still runs but the package logs a one-time
// warning and downstream emits become no-ops. The script keeps working.
registerIedoraOtel({ serviceName: 'iedora-migrate' })

// Instruments. Created at module init so the underlying provider sees
// a consistent identity across runs in the same process (relevant for
// migrate-test.mjs which spawns three migrate scripts in one process).
const migrationsCounter = meter.createCounter('iedora.migrations_total', {
  description: 'Total Drizzle migration runs, by schema and outcome.',
})
const migrationDuration = meter.createHistogram('iedora.migration_duration_ms', {
  description: 'Wall-clock duration of a Drizzle migration run, by schema.',
  unit: 'ms',
})

/**
 * crc32 of an ASCII string. Tiny implementation to avoid a runtime
 * dependency on Node 22.5+'s `zlib.crc32`. Result is an unsigned 32-bit
 * integer used directly as a Postgres advisory-lock key.
 */
function crc32(str) {
  let crc = 0xffffffff
  for (let i = 0; i < str.length; i++) {
    crc = crc ^ str.charCodeAt(i)
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function adminUrlFor(connStr) {
  const u = new URL(connStr)
  u.pathname = '/postgres'
  return u.toString()
}

function dbNameFromUrl(connStr) {
  const u = new URL(connStr)
  return decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres'
}

async function ensureDatabase(connStr, log) {
  const targetDb = dbNameFromUrl(connStr)
  const adminSql = postgres(adminUrlFor(connStr), {
    max: 1,
    onnotice: () => {},
  })
  try {
    const rows = await adminSql`SELECT 1 FROM pg_database WHERE datname = ${targetDb}`
    if (rows.length === 0) {
      await adminSql.unsafe(`CREATE DATABASE "${targetDb.replace(/"/g, '""')}"`)
      log(`created database "${targetDb}"`)
    }
  } finally {
    await adminSql.end()
  }
}

async function ensureSchema(sql, schemaName, log) {
  const safe = schemaName.replace(/"/g, '""')
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${safe}"`)
  log(`ensured schema "${schemaName}"`)
}

/**
 * Wrap an async operation in a span. Records exceptions onto the span
 * with the OTel-standard pattern so failures show up red in OO.
 */
async function withSpan(name, attrs, fn) {
  return tracer.startActiveSpan(name, { attributes: attrs }, async (span) => {
    try {
      const result = await fn()
      return result
    } catch (err) {
      span.recordException(err)
      span.setStatus({ code: 2, message: err?.message ?? String(err) }) // 2 = ERROR
      throw err
    } finally {
      span.end()
    }
  })
}

/**
 * @param {object} opts
 * @param {string} opts.databaseUrl     - Postgres connection string. Must include a DB name in the path.
 * @param {string} opts.migrationsFolder - Absolute path to the drizzle/ folder.
 * @param {string} opts.migrationsSchema - pg-schema where `__drizzle_migrations` lives. Usually the product's schema.
 * @param {string} opts.lockName         - Stable identifier used to derive the advisory-lock key. Convention: `iedora-<product>-migrate`.
 * @param {string} [opts.migrationsTable] - Defaults to `__drizzle_migrations`.
 * @param {string} [opts.label]          - Prefix used for stdout log lines. Defaults to migrationsSchema.
 */
export async function runMigrations({
  databaseUrl,
  migrationsFolder,
  migrationsSchema,
  lockName,
  migrationsTable = '__drizzle_migrations',
  label = migrationsSchema,
}) {
  if (!databaseUrl) throw new Error('runMigrations: databaseUrl is required')
  if (!migrationsFolder) throw new Error('runMigrations: migrationsFolder is required')
  if (!migrationsSchema) throw new Error('runMigrations: migrationsSchema is required')
  if (!lockName) throw new Error('runMigrations: lockName is required')

  const lockKey = crc32(lockName)
  const log = (msg) => console.log(`[migrate:${label}] ${msg}`)
  const dbName = dbNameFromUrl(databaseUrl)
  const startedAt = Date.now()

  log(`target database "${dbName}"`)

  // One root span covers the whole run; the four phases hang off it as
  // children so OO shows the relative cost of each step.
  let outcome = 'ok'
  try {
    await tracer.startActiveSpan(
      'migrate.run',
      {
        attributes: {
          'db.name': dbName,
          'db.schema': migrationsSchema,
          'migrate.lock_name': lockName,
        },
      },
      async (rootSpan) => {
        try {
          await withSpan('migrate.ensure_db', { 'db.name': dbName }, () =>
            ensureDatabase(databaseUrl, log),
          )

          const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
          const db = drizzle(sql)
          let locked = false
          try {
            await withSpan(
              'migrate.ensure_schema',
              { 'db.schema': migrationsSchema },
              () => ensureSchema(sql, migrationsSchema, log),
            )

            await withSpan(
              'migrate.acquire_lock',
              { 'migrate.lock_key': lockKey, 'migrate.lock_name': lockName },
              async () => {
                await sql`SELECT pg_advisory_lock(${lockKey})`
                locked = true
                log(`acquired advisory lock (key=${lockKey}, name="${lockName}")`)
              },
            )

            await withSpan(
              'migrate.apply',
              {
                'db.schema': migrationsSchema,
                'migrate.folder': migrationsFolder,
              },
              async () => {
                await migrate(db, {
                  migrationsFolder,
                  migrationsTable,
                  migrationsSchema,
                })
                log('migrations applied')
              },
            )
          } finally {
            if (locked) {
              try {
                await sql`SELECT pg_advisory_unlock(${lockKey})`
              } catch (err) {
                log(`warning: unlock failed: ${err?.message ?? err}`)
              }
            }
            await sql.end()
          }
        } catch (err) {
          rootSpan.recordException(err)
          rootSpan.setStatus({ code: 2, message: err?.message ?? String(err) })
          throw err
        } finally {
          rootSpan.end()
        }
      },
    )
  } catch (err) {
    outcome = 'fail'
    throw err
  } finally {
    const elapsed = Date.now() - startedAt
    migrationsCounter.add(1, {
      schema: migrationsSchema,
      outcome,
    })
    migrationDuration.record(elapsed, { schema: migrationsSchema })
    // Flush + shutdown so the short-lived script process doesn't exit
    // before BatchSpanProcessor / BatchLogRecordProcessor / metric
    // reader push to the collector. Bounded at 5s so a stuck exporter
    // can't keep the deploy job hostage.
    await shutdownIedoraOtel({ timeoutMs: 5_000 })
  }
}
