import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as celestrak from '../../catalog/celestrak.ts'
import { REGIONS }    from '../../catalog/cycle.ts'
import wrangler       from '../../catalog/wrangler.json' with { type: 'json' }
import { FILE }       from '../../lib/orbit/catalog.ts'
import * as answers   from '../common/spacetrack.ts'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class { constructor(readonly ctx: unknown, readonly env: unknown) {} }
}))

const { default: service, Refresher, Relay } = await import('../../catalog/service.ts')

/**
 * Builds the context of a Durable Object whose storage holds `state`.
 */
const contextOf = (state: Map<string, unknown>) => ({
  storage: {
    kv: {
      delete : (key: string) => state.delete(key),
      get    : (key: string) => state.get(key),
      put    : (key: string, value: unknown) => void state.set(key, value)
    }
  }
}) as never

/**
 * A wait running a day past the time each case runs at.
 */
const WAITING = { kind: 'refused', until: new Date(86_400_000).toISOString() }

describe('the refresher', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('places the relay for each region through its own location hint, keeping the wait', async () => {
    const getByName = vi.fn(() => ({ fetchFrom: async () => new Response(null, { status: 522 }) }))
    const env       = { CATALOG: { put: vi.fn() }, RELAYS: { getByName } }
    const state     = new Map<string, unknown>()
    const refresher = new Refresher(contextOf(state), env as never)
    expect(await refresher.run(0)).toEqual({ elements: 'failed', satcat: 'waiting' })
    expect(getByName.mock.calls).toEqual(REGIONS.map(region => [region, { locationHint: region }]))
    expect(state.get('wait')).toMatchObject({ kind: 'unreached' })
  })

  it('queries Space-Track itself with the login set as the secrets, sending nothing through a relay',
    async () => {
      const fetcher   = answers.answering(answers.ACCEPTED, () => Response.json([]), answers.LOGGED)
      const getByName = vi.fn()
      const env       = {
        CATALOG              : { put: vi.fn() },
        RELAYS               : { getByName },
        SPACE_TRACK_IDENTITY : 'observer',
        SPACE_TRACK_PASSWORD : 'orbit-2026'
      }
      const state     = new Map<string, unknown>([['satcat', { codes: {}, time: 0 }], ['wait', WAITING]])
      vi.stubGlobal('fetch', fetcher)
      const refresher = new Refresher(contextOf(state), env as never)
      expect(await refresher.run(0)).toEqual({ elements: 'failed', satcat: 'waiting' })
      expect(getByName).not.toHaveBeenCalled()
      expect(String(fetcher.mock.calls[0][1]?.body)).toBe('identity=observer&password=orbit-2026')
      expect(console.error).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'unchecked' }))
    })
})

describe('the relay', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends the request it is given with redirects left unfollowed under the header bound', async () => {
    const fetcher = vi.fn(async () => new Response('[]'))
    vi.stubGlobal('fetch', fetcher)
    await new Relay({} as never, {} as never).fetchFrom(celestrak.DIRECTORY)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(celestrak.DIRECTORY, expect.objectContaining({
      redirect : 'manual',
      signal   : expect.any(AbortSignal)
    }))
  })
})

describe('the worker', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('answers a request for the catalog from Workers KV and runs the refresher on the scheduled time',
    async () => {
      const refresher = { run: vi.fn() }
      const getByName = vi.fn(() => refresher)
      const get       = vi.fn(async () => null)
      const env       = { CATALOG: { get }, REFRESHER: { getByName } }
      vi.stubGlobal('caches', { default: { match: async () => undefined } })
      const request   = new Request(`https://upstairs.fyi/${FILE}`)
      const response  = await service.fetch(request as never, env as never, {} as never)
      expect(response.status).toBe(503)
      expect(get).toHaveBeenCalledOnce()
      await service.scheduled({ scheduledTime: 7 } as never, env as never)
      expect(refresher.run).toHaveBeenCalledExactlyOnceWith(7)
      expect(getByName).toHaveBeenCalledExactlyOnceWith('catalog')
    })
})

describe('the deploy config', () => {
  it('routes the catalog path alone to the service', () => {
    expect(wrangler.routes.map(route => route.pattern)).toEqual([`upstairs.fyi/${FILE}`])
  })

  it('turns on Workers Logs and Workers Observability Issues', () => {
    expect(wrangler.observability).toEqual({ enabled: true, issues: { enabled: true } })
  })
})
