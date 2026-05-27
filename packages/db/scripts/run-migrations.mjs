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
 * Behaviour:
 *   1. Ensures the target database exists (CREATE DATABASE IF NOT EXISTS).
 *   2. Pre-creates the target pg-schema (CREATE SCHEMA IF NOT EXISTS).
 *   3. Acquires a `pg_advisory_lock` keyed on a crc32 of `lockName`.
 *   4. Runs drizzle's programmatic `migrate()`.
 *   5. Releases the lock + closes the connection.
 *   6. Flushes OTel + shuts down providers (bounded at 5s).
 *
 * Observability (emitted when OTEL_EXPORTER_OTLP_ENDPOINT is set):
 *
 *   Spans (scope `iedora`, child of orchestrator's TRACEPARENT env):
 *     migrate.run                — root, attrs db.name + db.schema + lock.name
 *       migrate.ensure_db
 *       migrate.ensure_schema
 *       migrate.acquire_lock
 *       migrate.apply
 *
 *   Metrics (scope `iedora`):
 *     iedora.migrations_total{schema, outcome=ok|fail}  Counter
 *     iedora.migration_duration_ms{schema}              Histogram
 *
 * Plus structured stdout `[migrate:<label>] ...` log lines for every
 * phase — the container's runtime collector (fluentbit on Hetzner,
 * GH Actions log driver in CI) ships them to OpenObserve too. Logs +
 * traces + metrics correlate via the W3C trace context env vars.
 *
 * Throws on failure with the original error preserved — let it
 * propagate so the process exits non-zero with a useful stack.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import {
  context,
  propagation,
  SpanStatusCode,
  registerIedoraOtelNode,
  shutdownIedoraOtel,
  tracer,
  meter,
} from '@iedora/observability'

// Idempotent — the package's globalThis flag makes a second call a
// no-op. We register at module init so the instruments below
// (counter, histogram) bind to the real provider.
registerIedoraOtelNode({ serviceName: 'iedora-migrate' })

const migrationsCounter = meter.createCounter('iedora.migrations_total', {
  description: 'Total Drizzle migration runs, by schema and outcome.',
})
const migrationDuration = meter.createHistogram('iedora.migration_duration_ms', {
  description: 'Wall-clock duration of a Drizzle migration run, by schema.',
  unit: 'ms',
})

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

async function withSpan(name, attrs, fn) {
  return tracer.startActiveSpan(name, { attributes: attrs }, async (span) => {
    try {
      return await fn()
    } catch (err) {
      span.recordException(err)
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err?.message ?? String(err),
      })
      throw err
    } finally {
      span.end()
    }
  })
}

/**
 * @param {object} opts
 * @param {string} opts.databaseUrl
 * @param {string} opts.migrationsFolder
 * @param {string} opts.migrationsSchema
 * @param {string} opts.lockName
 * @param {string} [opts.migrationsTable]
 * @param {string} [opts.label]
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

  // Extract parent trace context from TRACEPARENT env, if the
  // orchestrator (iedora migrate, Stage 3 configurators) set it. No-op
  // otherwise — the migrate.run span just becomes its own root.
  const parentCtx = propagation.extract(context.active(), process.env)

  log(`target database "${dbName}"`)

  let outcome = 'ok'
  try {
    await context.with(parentCtx, () =>
      tracer.startActiveSpan(
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
                {
                  'migrate.lock_key': lockKey,
                  'migrate.lock_name': lockName,
                },
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
            rootSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: err?.message ?? String(err),
            })
            throw err
          } finally {
            rootSpan.end()
          }
        },
      ),
    )
  } catch (err) {
    outcome = 'fail'
    throw err
  } finally {
    const elapsed = Date.now() - startedAt
    migrationsCounter.add(1, { schema: migrationsSchema, outcome })
    migrationDuration.record(elapsed, { schema: migrationsSchema })
    log(`done (${elapsed}ms, outcome=${outcome})`)
    await shutdownIedoraOtel({ timeoutMs: 5_000 })
  }
}
