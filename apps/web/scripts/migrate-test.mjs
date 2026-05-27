// Applies every product schema migration the unified E2E suite needs:
//
//   1. core_test     — better-auth tables, applied by @iedora/auth's
//      self-healing migrate.mjs (creates the DB if absent).
//   2. menu_test     — menu's Drizzle schema, applied via drizzle-kit
//      from products/menu/.
//   3. imopush_test  — imopush's Drizzle schema, applied via drizzle-kit
//      from products/imopush/.
//
// Add a product = append it to PRODUCT_MIGRATIONS below + add its
// `<PRODUCT>_DATABASE_URL` to apps/web/.env.test. Products that own no
// Drizzle schema (e.g. core, which lives on @iedora/auth) need no entry.
//
// drizzle-kit migrate doesn't create databases — only the menu_test DB
// is bootstrapped by the postgres container (POSTGRES_DB env). Every
// other product DB is created here via CREATE DATABASE IF NOT EXISTS
// against the postgres admin DB, mirroring packages/auth/scripts/migrate.mjs.
//
// Invoked by `bun run db:migrate:test` from apps/web/, which loads
// `.env.test` via `bun --env-file=.env.test` before spawning this script.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import postgres from 'postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')

const PRODUCT_MIGRATIONS = [
  {
    name: 'menu',
    cwd: resolve(repoRoot, 'products/menu'),
    urlEnv: 'MENU_DATABASE_URL',
  },
  {
    name: 'imopush',
    cwd: resolve(repoRoot, 'products/imopush'),
    urlEnv: 'IMOPUSH_DATABASE_URL',
  },
]

const coreMigrate = resolve(repoRoot, 'packages/auth/scripts/migrate.mjs')

async function run(cmd, args, opts) {
  await new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts })
    p.on('close', (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    )
  })
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

async function ensureDatabase(connStr) {
  const targetDb = dbNameFromUrl(connStr)
  const adminSql = postgres(adminUrlFor(connStr), { max: 1, onnotice: () => {} })
  try {
    const rows = await adminSql`SELECT 1 FROM pg_database WHERE datname = ${targetDb}`
    if (rows.length === 0) {
      await adminSql.unsafe(`CREATE DATABASE "${targetDb.replace(/"/g, '""')}"`)
      console.log(`[migrate-test] created database "${targetDb}".`)
    }
  } finally {
    await adminSql.end()
  }
}

console.log('[migrate-test] applying core schema…')
await run('node', [coreMigrate])

for (const { name, cwd, urlEnv } of PRODUCT_MIGRATIONS) {
  const url = process.env[urlEnv]
  if (!url) throw new Error(`${urlEnv} not set in .env.test`)
  await ensureDatabase(url)
  console.log(`[migrate-test] applying ${name} schema…`)
  await run('bun', ['--bun', 'drizzle-kit', 'migrate'], { cwd })
}
