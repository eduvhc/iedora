import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const here = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Standalone output → minimal server.js bundle for Docker.
  output: 'standalone',
  // Bun workspaces monorepo: trace files up to the workspace root (two
  // levels above this file). Without this Next emits a warning and
  // traces only inside apps/web/, missing the per-product packages.
  outputFileTracingRoot: path.join(here, '..', '..'),
  transpilePackages: [
    '@iedora/design-system',
    '@iedora/observability',
    '@iedora/product-core',
    '@iedora/product-imopush',
    '@iedora/product-menu',
  ],
  // No `outputFileTracingIncludes` for migrate scripts — they're
  // bundled in apps/web/Dockerfile's `migrate-bundler` stage (single
  // ESM file each, all deps inlined). The Next standalone output is
  // for the request-serving path only. Industry-standard pattern;
  // refs are in DOCKER-1 in docs/tech-debt.md.
  // Version skew protection — forces hard navigation when the client
  // holds assets from a previous deployment. Passed as
  // DEPLOYMENT_VERSION build-arg from CI (typically GITHUB_SHA).
  deploymentId: process.env.DEPLOYMENT_VERSION,
  allowedDevOrigins: ['menu.733113.xyz'],
}

// next-intl's request config lives with the messages catalogues in
// @iedora/product-menu. apps/web wires it via the relative path.
const withNextIntl = createNextIntlPlugin(
  '../../products/menu/src/i18n/request.ts',
)
export default withNextIntl(nextConfig)
