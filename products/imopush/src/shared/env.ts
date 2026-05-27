/**
 * imopush's env contract.
 *
 * Two operating modes (mirrors products/menu/src/shared/env.ts):
 *  - Build (`SKIP_ENV_VALIDATION=1`): returns a stub Proxy so `next build`'s
 *    page-data-collection phase can evaluate server modules (db client,
 *    drizzle schema) without real secrets. Tofu wires the real env at
 *    runtime (Stage 4).
 *  - Runtime: parses `process.env` with Zod and crashes loud, naming the
 *    offending keys.
 */
import { z } from 'zod'

const serverSchema = z.object({
  IMOPUSH_DATABASE_URL: z.url(),
})

type ServerEnv = z.infer<typeof serverSchema>

const SKIP =
  process.env.SKIP_ENV_VALIDATION === '1' ||
  process.env.SKIP_ENV_VALIDATION === 'true'

function parseEnv(): ServerEnv {
  if (SKIP) {
    return new Proxy({} as ServerEnv, {
      get() {
        return ''
      },
    })
  }

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('Invalid imopush environment variables:')
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    }
    throw new Error('imopush env validation failed')
  }
  return parsed.data
}

export const env: ServerEnv = parseEnv()
