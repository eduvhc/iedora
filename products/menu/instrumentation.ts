/**
 * Next.js 16 instrumentation hook — runs once per server process at startup.
 *
 * Responsibilities today:
 *   - Wire OpenTelemetry traces via @iedora/observability (the shared
 *     OTel surface that every iedora product calls from its register hook).
 *   - Drain the postgres-js pool on SIGTERM/SIGINT so in-flight queries
 *     finish cleanly during Kamal rolling deploys.
 *
 * The dynamic `import('@/shared/db/client')` is intentional: keeping it lazy means the
 * DB module isn't pulled into the build's "collect page data" pass, only the
 * runtime server. See Next.js docs/api-reference/file-conventions/instrumentation.
 */
import { registerIedoraOtel } from '@iedora/observability'

export async function register() {
  // Edge runtime has no Node `process` signal API and no postgres-js client.
  // @vercel/otel itself supports edge, but we keep one gate to avoid loading
  // the DB module on the edge build.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

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
