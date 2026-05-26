import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import { env } from '@/shared/env'
import * as schema from './schema'

/**
 * T3-style globalThis singleton for the postgres-js client.
 *
 * Why: in dev, Next 16 HMR re-evaluates server modules on every code change,
 * which would create a new pool on each reload and eventually exhaust
 * Postgres connections. Caching on `globalThis` makes the client survive
 * module reloads in dev; in production each worker still gets exactly one
 * pool (no global cache needed).
 */
type DbClient = ReturnType<typeof postgres>

const globalForDb = globalThis as unknown as {
  conn?: DbClient
}

const conn: DbClient =
  globalForDb.conn ??
  postgres(env.DATABASE_URL, {
    max: 10,
    prepare: false,
  })

if (env.NODE_ENV !== 'production') {
  globalForDb.conn = conn
}

export const db = drizzle(conn, { schema, casing: 'snake_case' })
export type DB = typeof db

/**
 * Round-trip the connection with `SELECT 1`, racing against a timeout.
 * Used by the apps/web /up health route — keeping the drizzle-orm
 * dependency inside this package (apps/web shouldn't need to import
 * drizzle-orm directly just to ping the DB).
 */
export async function pingDb(timeoutMs: number): Promise<void> {
  await Promise.race([
    db.execute(sql`SELECT 1`),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`db ping timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ])
}

/**
 * Graceful pool drain. Called from `instrumentation.ts` on SIGTERM/SIGINT
 * (container restart on `tofu apply` with a new image SHA). `timeout` is
 * seconds, matching postgres-js's `sql.end({ timeout })` semantics —
 * pending queries get that long to finish before sockets are closed.
 */
export async function closeDb(opts: { timeout?: number } = {}): Promise<void> {
  await conn.end({ timeout: opts.timeout ?? 5 })
  if (globalForDb.conn === conn) {
    globalForDb.conn = undefined
  }
}
