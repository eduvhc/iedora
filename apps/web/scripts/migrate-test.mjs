// Applies every product schema migration the unified E2E suite needs.
//
// Goes through the SAME path as bin/dev-stack + Stage 3 prod: the
// `iedora local migrate` Go subcommand builds the dedicated migrate
// image (infra/migrate/Dockerfile) and `docker run --rm`s it once per
// product. One source of truth (`infra/deploy/cmd/iedora/local_migrate.go::
// localMigrators`) for the product list; one image; one entrypoint
// layout. No host-bun shellout, no per-product loop here.
//
// CI specifics: GitHub Actions exposes the postgres service container on
// host port 5432; the migrate container joins `--network host` so
// `localhost:5432` from inside it = the postgres service. Same
// password as the dev compose stack (`Password1!`), so no flag override.
//
// Add a product = the change goes in local_migrate.go::localMigrators
// + infra/migrate/Dockerfile + products/<p>/scripts/migrate.mjs.
// This script doesn't need to change.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')

const iedora = resolve(repoRoot, 'bin/iedora')

await new Promise((res, rej) => {
  const p = spawn(
    iedora,
    [
      'migrate',
      '--repo', repoRoot,
      // GH Actions postgres service is exposed on host port 5432, not on
      // any docker network reachable from the migrate container — use
      // host networking so `localhost:5432` resolves to the service.
      '--network', 'host',
      '--pg-host', 'localhost',
    ],
    { stdio: 'inherit' },
  )
  p.on('close', (code) =>
    code === 0
      ? res()
      : rej(new Error(`iedora local migrate exited ${code}`)),
  )
})
