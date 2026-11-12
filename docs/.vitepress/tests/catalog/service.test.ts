import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as celestrak from '../../catalog/celestrak.ts'
import { REGIONS }    from '../../catalog/cycle.ts'
import wrangler       from '../../catalog/wrangler.json' with { type: 'json' }

vi.mock('cloudflare:workers', () => ({
  DurableObject: class { constructor(readonly ctx: unknown, readonly env: unknown) {} }
}))

const { default: service, Refresher, Relay } = await import('../../catalog/service.ts')

describe('the refresher', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('places the relay for each region through its own location hint, keeping the halt until '
   + 'resumed', async () => {
    const getByName = vi.fn(() => ({ fetchCatalog: async () => new Response(null, { status: 522 }) }))
    const env       = { CATALOG: { put: vi.fn() }, RELAYS: { getByName } }
    const state     = new Map<string, unknown>()
    const kv        = {
      delete : (key: string) => state.delete(key),
      get    : (key: string) => state.get(key),
      put    : (key: string, value: unknown) => void state.set(key, value)
    }
    const refresher = new Refresher({ storage: { kv } } as never, env as never)
    expect(await refresher.run(0)).toBe('halted')
    expect(getByName.mock.calls).toEqual(REGIONS.map(region => [region, { locationHint: region }]))
    const halt = refresher.halt()
    expect(halt).toMatchObject({ kind: 'unreached' })
    expect(refresher.resume()).toEqual(halt)
    expect(refresher.halt()).toBeUndefined()
  })
})

describe('the relay', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends the catalog request with redirects left unfollowed under the header bound', async () => {
    const fetcher = vi.fn(async () => new Response('[]'))
    vi.stubGlobal('fetch', fetcher)
    await new Relay({} as never, {} as never).fetchCatalog()
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(celestrak.SOURCE, expect.objectContaining({
      redirect : 'manual',
      signal   : expect.any(AbortSignal)
    }))
  })
})

describe('the worker', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('answers the resume path through the refresher and runs it on the scheduled time', async () => {
    const halt      = { kind: 'refused' }
    const refresher = { halt: vi.fn(), resume: vi.fn(async () => halt), run: vi.fn() }
    const getByName = vi.fn(() => refresher)
    const env       = { REFRESHER: { getByName }, RESUME_TOKEN: 'token' }
    vi.stubGlobal('caches', { default: {} })
    const request  = new Request('https://upstairs.fyi/catalog/resume', {
      headers : { authorization: 'Bearer token' },
      method  : 'POST'
    })
    const response = await service.fetch(request as never, env as never, {} as never)
    expect(await response.json()).toEqual(halt)
    await service.scheduled({ scheduledTime: 7 } as never, env as never)
    expect(refresher.run).toHaveBeenCalledExactlyOnceWith(7)
    expect(getByName.mock.calls).toEqual([['catalog'], ['catalog']])
  })
})

describe('the deploy config', () => {
  it('turns on Workers Logs and Workers Observability Issues', () => {
    expect(wrangler.observability).toEqual({ enabled: true, issues: { enabled: true } })
  })
})
