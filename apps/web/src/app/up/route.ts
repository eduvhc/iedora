import { pingDb } from '@iedora/product-menu/shared/db/client'

/**
 * Healthcheck endpoint. Hit by the proxy + uptime monitors.
 * Returns 200 only if the DB answers `SELECT 1` within 2 seconds.
 * Bypasses every cache via `force-dynamic` so polls always reach origin.
 * No tenant tables are touched — this route is intentionally
 * unauthenticated and must stay that way.
 */

export const dynamic = 'force-dynamic'

const DB_TIMEOUT_MS = 2000

export async function GET(): Promise<Response> {
  try {
    await pingDb(DB_TIMEOUT_MS)
  } catch (err) {
    const message =
      err instanceof Error ? err.message.split('\n')[0] : 'db unreachable'
    return Response.json(
      { ok: false, error: message },
      {
        status: 503,
        headers: { 'cache-control': 'no-store, max-age=0' },
      },
    )
  }

  return Response.json(
    { ok: true, db: 'ok' },
    { headers: { 'cache-control': 'no-store, max-age=0' } },
  )
}
