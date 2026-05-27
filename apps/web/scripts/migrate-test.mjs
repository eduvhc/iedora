// Applies every product schema migration the unified E2E suite needs:
//
//   1. core_test     — better-auth tables (@iedora/auth).
//   2. menu_test     — menu's Drizzle schema (products/menu/).
//   3. imopush_test  — imopush's Drizzle schema (products/imopush/).
//
// Each product owns a `scripts/migrate.mjs` that wraps the canonical
// helper (@iedora/db/scripts/run-migrations): ensureDatabase + advisory
// lock + programmatic migrate(). This script just spawns those in order
// and bails on the first non-zero exit.
//
// History note: this used to spawn `bun --bun drizzle-kit migrate` per
// product. drizzle-kit's CLI swallows errors and exits 1 silently, which
// made one specific failure mode (newer drizzle-kit dropping IF NOT
// EXISTS from generated migrations, colliding with the schema the
// migrator pre-creates) feel like a phantom — no stack, no SQL state,
// nothing. Going through the per-product `migrate.mjs` gives us real
// stack traces on failure.
//
// Add a product = append it to PRODUCT_MIGRATIONS below + add its
// `<PRODUCT>_DATABASE_URL` to apps/web/.env.test. Core is bootstrapped
// separately (it lives in packages/auth, not products/).
//
// Invoked by `bun run db:migrate:test` from apps/web/, which loads
// `.env.test` via `bun --env-file=.env.test` before spawning this.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')

const PRODUCT_MIGRATIONS = [
  {
    name: 'core',
    script: resolve(repoRoot, 'packages/auth/scripts/migrate.mjs'),
    urlEnv: 'CORE_DATABASE_URL',
  },
  {
    name: 'menu',
    script: resolve(repoRoot, 'products/menu/scripts/migrate.mjs'),
    urlEnv: 'MENU_DATABASE_URL',
  },
  {
    name: 'imopush',
    script: resolve(repoRoot, 'products/imopush/scripts/migrate.mjs'),
    urlEnv: 'IMOPUSH_DATABASE_URL',
  },
]

async function run(cmd, args, opts) {
  await new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts })
    p.on('close', (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    )
  })
}

for (const { name, script, urlEnv } of PRODUCT_MIGRATIONS) {
  if (!process.env[urlEnv]) {
    throw new Error(`${urlEnv} not set in .env.test (needed for migrate:${name})`)
  }
  console.log(`[migrate-test] applying ${name} schema…`)
  // Run via bun, not node — the migrate scripts import @iedora/observability
  // whose package exports point at TS source. bun resolves TS workspace
  // sources natively; node would need a tsx loader. Prod (infra/migrate/
  // Dockerfile) uses `bun build` to pre-bundle into a single ESM file
  // that node can execute, so the distroless image stays bun-free.
  await run('bun', [script])
}
