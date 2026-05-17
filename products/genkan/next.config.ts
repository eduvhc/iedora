import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const here = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  output: 'standalone',
  // Bun workspaces monorepo — trace files up to the workspace root so the
  // standalone build includes the linked @iedora/design-system.
  outputFileTracingRoot: path.join(here, '..', '..'),
  transpilePackages: ['@iedora/design-system'],
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/drizzle-orm/**/*',
      './node_modules/postgres/**/*',
      './drizzle/**/*',
      // All maintenance scripts ship with the container so kamal-app-exec
      // can run them. The list grows when a new one-shot lands.
      './scripts/migrate.mjs',
      './scripts/encrypt-webhook-secrets.mjs',
      './scripts/backfill-audit-chain.mjs',
    ],
  },
}

export default nextConfig
