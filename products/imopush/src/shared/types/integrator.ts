/**
 * Publication state machine shared across integrators (idealista, olx, …).
 * Persisted in `imopush.integrator_status.state`.
 */
export type IntegratorState = 'idle' | 'publishing' | 'published' | 'failed'

export type IntegratorKey = 'idealista'

export type IntegratorStatus = {
  key: IntegratorKey
  state: IntegratorState
  publishedAt?: Date | null
  publishedUrl?: string | null
  lastError?: string | null
  updatedAt?: Date | null
}
