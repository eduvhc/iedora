import 'server-only'
import { z } from 'zod'
import type { IdealistaPublisher, PublishResult, PublishStore } from '../ports'

const inputSchema = z.object({
  reference: z.string().min(1),
})

export async function publishProperty(
  deps: { publisher: IdealistaPublisher; store: PublishStore },
  raw: unknown,
): Promise<PublishResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { reference } = parsed.data

  const property = await deps.store.getProperty(reference)
  if (!property) return { ok: false, error: `Propriedade não encontrada: ${reference}` }

  await deps.store.upsertIdealistaStatus(reference, { state: 'publishing' })

  const result = await deps.publisher.publish(property)

  if (!result.ok) {
    await deps.store.upsertIdealistaStatus(reference, {
      state: 'failed',
      lastError: result.error,
    })
    return { ok: false, error: result.error }
  }

  await deps.store.upsertIdealistaStatus(reference, {
    state: 'published',
    publishedAt: new Date(),
    publishedUrl: result.publishedUrl,
  })

  return { ok: true, publishedUrl: result.publishedUrl }
}
