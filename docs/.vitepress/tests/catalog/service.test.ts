import { describe, expect, it, vi } from 'vitest'

import { REGIONS } from '../../catalog/cycle.ts'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class { constructor(readonly ctx: unknown, readonly env: unknown) {} }
}))

const { Refresher } = await import('../../catalog/service.ts')

describe('the refresher', () => {
  it('places the relay for each region through its own location hint', async () => {
    const state     = new Map<string, unknown>()
    const getByName = vi.fn(() => ({ fetchCatalog: async () => new Response(null, { status: 522 }) }))
    const storage   = {
      delete : (key: string) => state.delete(key),
      get    : (key: string) => state.get(key),
      put    : (key: string, value: unknown) => void state.set(key, value)
    }
    const refresher = new Refresher({ storage: { kv: storage } } as never, {
      ALERT_FROM : 'catalog@upstairs.fyi',
      ALERT_TO   : 'someone@example.com',
      CATALOG    : { put: vi.fn() },
      EMAIL      : { send: vi.fn(async () => {}) },
      RELAYS     : { getByName }
    } as never)
    expect(await refresher.run(0)).toBe('halted')
    expect(getByName.mock.calls).toEqual(REGIONS.map(region => [region, { locationHint: region }]))
  })
})
