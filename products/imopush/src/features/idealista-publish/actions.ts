'use server'

import { revalidatePath } from 'next/cache'
import { createCdpIdealistaPublisher } from './adapters/cdp-publisher'
import { drizzlePublishStore } from './adapters/drizzle-store'
import { publishProperty } from './use-cases/publish-property'
import type { PublishResult } from './ports'

export async function publishToIdealista(reference: string): Promise<PublishResult> {
  const result = await publishProperty(
    { publisher: createCdpIdealistaPublisher(), store: drizzlePublishStore },
    { reference },
  )
  revalidatePath(`/imopush/dashboard/p/${reference}`)
  revalidatePath('/imopush/dashboard')
  return result
}
