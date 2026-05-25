import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const here = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  transpilePackages: ['@iedora/design-system'],
  outputFileTracingRoot: path.join(here, '..', '..'),
}

export default nextConfig
