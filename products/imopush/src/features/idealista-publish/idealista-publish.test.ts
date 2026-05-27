import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { publishProperty } from './use-cases/publish-property'
import type { IdealistaPublisher, PublishResult, PublishStore } from './ports'
import type { Property } from '../properties'

function makeFakeStore(initial?: Property) {
  const saved: Array<Parameters<PublishStore['upsertIdealistaStatus']>[1]> = []
  const store: PublishStore = {
    getProperty: vi.fn(async () => initial ?? null),
    upsertIdealistaStatus: vi.fn(async (_ref, s) => {
      saved.push(s)
    }),
  }
  return { store, saved }
}

function makeFakePublisher(result: PublishResult): IdealistaPublisher {
  return { publish: vi.fn(async () => result) }
}

const baseProperty: Property = {
  reference: 'ref-1',
  type: 'apartment',
  operation: 'sale',
  priceCents: 25_000_000,
  address: { locality: 'Lisboa' },
  contact: { name: 'Eduardo', email: 'me@example.com' },
}

describe('publishProperty', () => {
  it('rejects empty reference', async () => {
    const { store } = makeFakeStore()
    const publisher = makeFakePublisher({ ok: true })

    const result = await publishProperty({ publisher, store }, { reference: '' })

    expect(result.ok).toBe(false)
    expect(store.getProperty).not.toHaveBeenCalled()
    expect(publisher.publish).not.toHaveBeenCalled()
  })

  it('returns error when property is missing', async () => {
    const { store } = makeFakeStore(undefined)
    const publisher = makeFakePublisher({ ok: true })

    const result = await publishProperty({ publisher, store }, { reference: 'missing' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/não encontrada/i)
    expect(publisher.publish).not.toHaveBeenCalled()
  })

  it('writes publishing → published transition on success', async () => {
    const { store, saved } = makeFakeStore(baseProperty)
    const publisher = makeFakePublisher({
      ok: true,
      publishedUrl: 'https://www.idealista.pt/imovel/12345/',
    })

    const result = await publishProperty({ publisher, store }, { reference: 'ref-1' })

    expect(result.ok).toBe(true)
    expect(saved).toHaveLength(2)
    expect(saved[0]).toMatchObject({ state: 'publishing' })
    expect(saved[1]).toMatchObject({
      state: 'published',
      publishedUrl: 'https://www.idealista.pt/imovel/12345/',
    })
    expect(saved[1]?.publishedAt).toBeInstanceOf(Date)
  })

  it('writes publishing → failed transition on publisher error', async () => {
    const { store, saved } = makeFakeStore(baseProperty)
    const publisher = makeFakePublisher({ ok: false, error: 'CDP timeout' })

    const result = await publishProperty({ publisher, store }, { reference: 'ref-1' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('CDP timeout')

    expect(saved).toHaveLength(2)
    expect(saved[1]).toMatchObject({ state: 'failed', lastError: 'CDP timeout' })
  })

  it('passes the property unchanged to the publisher', async () => {
    const { store } = makeFakeStore(baseProperty)
    const publisher = makeFakePublisher({ ok: true })

    await publishProperty({ publisher, store }, { reference: 'ref-1' })

    expect(publisher.publish).toHaveBeenCalledWith(baseProperty)
  })
})
