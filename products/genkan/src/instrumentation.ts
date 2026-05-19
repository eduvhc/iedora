/**
 * Next 16 server-init hook. Runs once per Node process at startup, BEFORE
 * any request is served. Wire long-lived background jobs here so we don't
 * spin them up lazily off a request path.
 *
 * Today: OpenTelemetry traces (via @iedora/observability) + the JWKS
 * rotation cron. Both gated on `NEXT_RUNTIME === 'nodejs'` so the
 * Edge/Workers build doesn't try to import server-only Postgres / Node
 * signal code.
 *
 * Add new long-lived jobs by importing their `start*` function inside the
 * same `if (nodejs)` branch — keep imports dynamic so the Edge build
 * doesn't pull them in via static analysis.
 */
import { registerIedoraOtel } from '@iedora/observability'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    registerIedoraOtel({ serviceName: 'iedora-genkan' })
    const { startCron } = await import('@/features/auth/cron')
    startCron()
  }
}
