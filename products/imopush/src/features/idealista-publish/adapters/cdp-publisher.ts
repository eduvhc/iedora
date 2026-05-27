import 'server-only'
import type { IdealistaPublisher } from '../ports'

/**
 * Production publisher = drives the Idealista web UI via Chrome DevTools
 * Protocol. The full implementation lived on the standalone-Next imopush
 * branch (`scripts/idealista/fill-listing.cjs` + a CDP driver). Re-porting
 * that is a follow-up — it depends on a long-running Chrome process and
 * BWS-managed credentials that aren't wired into the apps/web container.
 *
 * For now this stub writes a deterministic "not implemented" failure so
 * the UI exercises the failed → retry path against a real DB row.
 */
export function createCdpIdealistaPublisher(): IdealistaPublisher {
  return {
    async publish() {
      return {
        ok: false,
        error: 'Publicador CDP por ligar (TODO: portar de scripts/idealista/).',
      }
    },
  }
}
