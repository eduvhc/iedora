// Applies every product schema migration the unified E2E suite needs:
//
//   1. core_test  — better-auth tables, applied by @iedora/auth's
//      self-healing migrate.mjs (creates the DB if absent).
//   2. menu_test  — menu's Drizzle schema, applied via drizzle-kit
//      from products/menu/.
//
// Add a product = append it to PRODUCT_MIGRATIONS below. Products that
// own no Drizzle schema (e.g. core, which lives on @iedora/auth) need
// no entry here.
//
// Invoked by `bun run db:migrate:test` from apps/web/, which loads
// `.env.test` via `bun --env-file=.env.test` before spawning this
// script.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')

const PRODUCT_MIGRATIONS = [
  { name: 'menu', cwd: resolve(repoRoot, 'products/menu') },
]

const coreMigrate = resolve(
  repoRoot,
  'packages/auth/scripts/migrate.mjs',
)

async function run(cmd, args, opts) {
  await new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts })
    p.on('close', (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    )
  })
}

console.log('[migrate-test] applying core schema…')
await run('node', [coreMigrate])

for (const { name, cwd } of PRODUCT_MIGRATIONS) {
  console.log(`[migrate-test] applying ${name} schema…`)
  await run('bun', ['--bun', 'drizzle-kit', 'migrate'], { cwd })
}
