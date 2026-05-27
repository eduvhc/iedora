import { describe, it, expect, vi } from 'vitest'
import { listProperties } from './use-cases/list-properties'
import { getProperty } from './use-cases/get-property'
import type { PropertiesGateway, Property } from './ports'

const sample: Property = {
  reference: 'ref-1',
  type: 'apartment',
  operation: 'sale',
  priceCents: 25_000_000,
  address: { locality: 'Lisboa' },
  contact: { name: 'Eduardo', email: 'me@example.com' },
}

function makeGateway(overrides: Partial<PropertiesGateway> = {}): PropertiesGateway {
  return {
    list: vi.fn(async () => [sample]),
    getByReference: vi.fn(async (ref: string) => (ref === sample.reference ? sample : null)),
    ...overrides,
  }
}

describe('listProperties', () => {
  it('delegates to the gateway', async () => {
    const gw = makeGateway()
    const rows = await listProperties(gw)
    expect(rows).toEqual([sample])
    expect(gw.list).toHaveBeenCalledOnce()
  })
})

describe('getProperty', () => {
  it('returns null for empty reference without hitting the gateway', async () => {
    const gw = makeGateway()
    const got = await getProperty(gw, '')
    expect(got).toBeNull()
    expect(gw.getByReference).not.toHaveBeenCalled()
  })

  it('returns the row when the gateway finds it', async () => {
    const gw = makeGateway()
    const got = await getProperty(gw, 'ref-1')
    expect(got?.reference).toBe('ref-1')
  })

  it('returns null when the gateway misses', async () => {
    const gw = makeGateway()
    const got = await getProperty(gw, 'nope')
    expect(got).toBeNull()
  })
})
