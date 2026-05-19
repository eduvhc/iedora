/**
 * Node-only instrumentation. Imported dynamically from `instrumentation.ts`
 * ONLY when `process.env.NEXT_RUNTIME === 'nodejs'`, so Next 16's Edge
 * Runtime static analysis never sees `process.on(...)` or the postgres-js
 * client. Without this split, Turbopack production builds fail with
 * "A Node.js API is used (process.on at line: X) which is not supported
 * in the Edge Runtime" — the static checker doesn't understand the
 * runtime guard in the parent module.
 */
import { registerIedoraOtel } from '@iedora/observability'

export async function registerNode() {
  registerIedoraOtel({ serviceName: 'iedora-menu' })

  const { closeDb } = await import('@/shared/db/client')

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[instrumentation] ${signal} received, draining DB…`)
    try {
      await closeDb({ timeout: 5 })
      console.log('[instrumentation] DB drained')
    } catch (err) {
      console.error('[instrumentation] DB drain failed:', err)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}
