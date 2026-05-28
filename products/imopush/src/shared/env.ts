import { z } from 'zod'

/**
 * imopush's env contract. Zod-validated at module load so missing keys
 * fail fast at boot, not on first request.
 *
 * Add new env vars here as imopush grows.
 */
const envSchema = z.object({
  IMOPUSH_DATABASE_URL: z.string().url(),
})

export const env = envSchema.parse(process.env)
