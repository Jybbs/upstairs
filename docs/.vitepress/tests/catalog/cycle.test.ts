import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as celestrak                         from '../../catalog/celestrak.ts'
import { Cycle, EVERY, REGIONS, type Region } from '../../catalog/cycle.ts'
import * as catalog                           from '../../lib/orbit/catalog.ts'
import full                                   from '../fixtures/records.json' with { type: 'json' }

const fixture = full as unknown as catalog.Record[]
const records = Array.from({ length: 5000 }, (_, row) => ({
  ...fixture[row % fixture.length],
  NORAD_CAT_ID: 100_000 + row
}))
const start = Date.parse('2026-11-10T00:00:00Z')

const SPACINGS = [[EVERY - 1, 'early'], [EVERY, 'stored']] as const
const REFUSALS = [301, 403, 404, 500, 503, 520]
const refused  = (status: number) => () => new Response(null, { status })
const MISSES   = [
  ['Cloudflare answers 521', refused(521), '521'],
  ['Cloudflare answers 522', refused(522), '522'],
  ['Cloudflare answers 523', refused(523), '523'],
  ['the request throws', () => { throw new TypeError('Network connection lost') }, 'Network connection lost']
] as const

const cycleOf = (
  answer : (region: Region, init?: RequestInit) => Response | Promise<Response>,
  write  : () => Promise<void> = async () => {}
) => {
  const state   = new Map<string, unknown>()
  const stored  = new Map<string, unknown>()
  const fetcher = vi.fn(async (region: Region, _source: RequestInfo | URL, init?: RequestInit) =>
    answer(region, init))
  const storage = {
    delete : (key: string) => state.delete(key),
    get    : <T>(key: string) => state.get(key) as T,
    put    : (key: string, value: unknown) => void state.set(key, value)
  }
  const put   = (key: string, value: unknown) => write().then(() => void stored.set(key, value))
  const cycle = new Cycle(storage, { CATALOG: { put } }, region =>
    celestrak.fetchCatalog((source, init) => fetcher(region, source, init)))
  return { cycle, state, stored, fetcher }
}

const good  = () => Response.json(records)
const stall = (_: Region, init?: RequestInit) => new Promise<Response>((_, reject) =>
  init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)))

const logged = () => vi.mocked(console.error).mock.calls.map(([entry]) => entry)

describe('a download cycle', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('stores the catalog it downloads, asking CelesTrak once with redirects left unfollowed', async () => {
    const { cycle, stored, fetcher } = cycleOf(good)
    expect(await cycle.run(start)).toBe('stored')
    expect(stored.get(catalog.FILE)).toBeInstanceOf(Uint8Array)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      REGIONS[0], celestrak.SOURCE, expect.objectContaining({ redirect: 'manual' })
    )
    expect(console.error).not.toHaveBeenCalled()
  })

  it('dates the stored file by the time the cycle ran', async () => {
    const { cycle, stored } = cycleOf(good)
    await cycle.run(start)
    const file      = new Blob([stored.get(catalog.FILE) as Uint8Array<ArrayBuffer>])
    const { value } = await catalog.segmentsOf(file.stream()).next()
    expect(value?.fetched).toBe(start)
  })

  it.each(SPACINGS)('answers a run %i ms after the last as %s', async (after, outcome) => {
    const { cycle, fetcher } = cycleOf(good)
    await cycle.run(start)
    expect(await cycle.run(start + after)).toBe(outcome)
    expect(fetcher).toHaveBeenCalledTimes(outcome === 'early' ? 1 : 2)
  })

  it.each(REFUSALS)('halts on a %i without trying another region, logging and keeping the refusal',
    async status => {
      const headers = { 'content-type': 'text/html', 'retry-after': '7200', 'set-cookie': 'session' }
      const { cycle, state, stored, fetcher } = cycleOf(() => new Response('Refused', { status, headers }))
      expect(await cycle.run(start)).toBe('halted')
      expect(fetcher).toHaveBeenCalledOnce()
      expect(stored.size).toBe(0)
      const halt = {
        body    : 'Refused',
        event   : 'catalog.halted',
        headers : { 'content-type': 'text/html', 'retry-after': '7200' },
        kind    : 'refused',
        reason  : `CelesTrak answered ${status}`,
        region  : REGIONS[0],
        status  : status,
        time    : new Date(start).toISOString()
      }
      expect(logged()).toEqual([halt])
      expect(state.get('halted')).toEqual(halt)
    })

  it('halts on a refusal whose body fails partway, asking CelesTrak once', async () => {
    const body = () => new ReadableStream({
      pull: controller => controller.error(new TypeError('Network connection lost'))
    })
    const { cycle, state, fetcher } = cycleOf(() => new Response(body(), { status: 403 }))
    expect(await cycle.run(start)).toBe('halted')
    expect(await cycle.run(start + EVERY)).toBe('halted')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(state.get('halted')).toMatchObject({ kind: 'refused', region: REGIONS[0], status: 403 })
  })

  it.each([
    ['a list shorter than the active catalog', () => Response.json(records.slice(0, 10)), 'Expected a list'],
    ['a body that is not JSON', () => new Response('<html>'), 'JSON'],
    ['JSON that is not a list', () => Response.json({ error: 'busy' }), 'busy']
  ])('halts on %s as a catalog that fails its check', async (_, answer, reason) => {
    const { cycle, state } = cycleOf(answer)
    expect(await cycle.run(start)).toBe('halted')
    expect(state.get('halted')).toMatchObject({
      kind   : 'unchecked',
      reason : expect.stringContaining(reason),
      region : REGIONS[0]
    })
  })

  it.each(MISSES)('moves to the next region when %s', async (_, miss) => {
    const { cycle, fetcher } = cycleOf(region => region === REGIONS[0] ? miss() : good())
    expect(await cycle.run(start)).toBe('stored')
    expect(fetcher.mock.calls.map(([region]) => region)).toEqual(REGIONS.slice(0, 2))
  })

  it('starts each cycle from the region that last reached CelesTrak', async () => {
    const { cycle, fetcher } = cycleOf(region => region === REGIONS[0] ? refused(522)() : good())
    await cycle.run(start)
    fetcher.mockClear()
    expect(await cycle.run(start + EVERY)).toBe('stored')
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(REGIONS[1], celestrak.SOURCE, expect.anything())
  })

  it('starts from the first region where the stored region is no longer listed', async () => {
    const { cycle, state, fetcher } = cycleOf(good)
    state.set('reached', 'retired')
    expect(await cycle.run(start)).toBe('stored')
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(REGIONS[0], celestrak.SOURCE, expect.anything())
  })

  it('keeps the region that last reached CelesTrak through a cycle no region reaches', async () => {
    let answer = (region: Region) => region === REGIONS[0] ? refused(522)() : good()
    const { cycle, fetcher } = cycleOf(region => answer(region))
    await cycle.run(start)
    answer = refused(522)
    expect(await cycle.run(start + EVERY)).toBe('halted')
    cycle.resume()
    answer = good
    fetcher.mockClear()
    expect(await cycle.run(start + 2 * EVERY)).toBe('stored')
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(REGIONS[1], celestrak.SOURCE, expect.anything())
  })

  it('halts on a status CelesTrak sends after moving to the next region, naming that region', async () => {
    const { cycle, state, fetcher } = cycleOf(region => refused(region === REGIONS[0] ? 522 : 403)())
    expect(await cycle.run(start)).toBe('halted')
    expect(fetcher.mock.calls.map(([region]) => region)).toEqual(REGIONS.slice(0, 2))
    expect(state.get('halted')).toMatchObject({ kind: 'refused', region: REGIONS[1], status: 403 })
  })

  it('halts once no region reaches CelesTrak, naming the result of each region', async () => {
    const missOf  = (region: Region) => MISSES[REGIONS.indexOf(region) % MISSES.length]
    const results = REGIONS.map(region => [region, expect.stringContaining(missOf(region)[2])])
    const { cycle, state, fetcher } = cycleOf(region => missOf(region)[1]())
    expect(await cycle.run(start)).toBe('halted')
    expect(fetcher).toHaveBeenCalledTimes(REGIONS.length)
    expect(state.get('halted')).toMatchObject({
      kind    : 'unreached',
      reason  : 'No region reached CelesTrak',
      regions : Object.fromEntries(results)
    })
    expect(state.get('halted')).not.toHaveProperty('region')
  })

  it('halts where no headers arrive within the bound, trying no other region', async () => {
    vi.useFakeTimers()
    const { cycle, state, fetcher } = cycleOf(stall)
    const outcome = cycle.run(start)
    await vi.advanceTimersByTimeAsync(celestrak.HEADER_WAIT)
    expect(await outcome).toBe('halted')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(state.get('halted')).toMatchObject({
      kind   : 'unanswered',
      reason : `No answer within ${celestrak.HEADER_WAIT} ms`,
      region : REGIONS[0]
    })
  })

  it('halts where the write to Workers KV fails, naming the region that reached CelesTrak', async () => {
    const { cycle, state, stored } = cycleOf(good, async () => { throw new Error('KV PUT failed: 500') })
    expect(await cycle.run(start)).toBe('halted')
    expect(stored.size).toBe(0)
    expect(state.get('halted')).toMatchObject({
      kind   : 'unstored',
      reason : 'Error: KV PUT failed: 500',
      region : REGIONS[0]
    })
  })

  it('fails the run without halting where the catalog fails outside the named kinds', async () => {
    const { cycle, state, stored } = cycleOf(() => Response.json(Array(5000).fill(0)))
    await expect(cycle.run(start)).rejects.toThrow(TypeError)
    expect(state.get('halted')).toBeUndefined()
    expect(stored.size).toBe(0)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('logs the stored halt again under an event of its own on each run it blocks, asking CelesTrak '
   + 'once', async () => {
    const { cycle, state, fetcher } = cycleOf(refused(403))
    await cycle.run(start)
    const halt = state.get('halted')
    expect(await cycle.run(start + EVERY)).toBe('halted')
    expect(await cycle.run(start + 2 * EVERY)).toBe('halted')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(logged()).toEqual([halt, ...Array(2).fill({ event: 'catalog.blocked', halt })])
  })

  it('stays halted through later cycles until resumed, then logs and returns the halt it clears',
    async () => {
      let answer = refused(403)
      const { cycle, state, fetcher } = cycleOf(() => answer())
      await cycle.run(start)
      const halt = state.get('halted')
      expect(await cycle.run(start + 2 * EVERY)).toBe('halted')
      expect(fetcher).toHaveBeenCalledTimes(1)
      answer = good
      expect(cycle.resume()).toEqual(halt)
      expect(console.log).toHaveBeenCalledExactlyOnceWith({ event: 'catalog.resumed', halt })
      expect(cycle.halt).toBeUndefined()
      expect(await cycle.run(start + 3 * EVERY)).toBe('stored')
    })

  it('blocks on a halt stored as text, logging it on each run and returning it on a resume', async () => {
    const { cycle, state, fetcher } = cycleOf(good)
    state.set('halted', 'Error: CelesTrak answered 403')
    expect(await cycle.run(start)).toBe('halted')
    expect(fetcher).not.toHaveBeenCalled()
    expect(logged()).toEqual([{ event: 'catalog.blocked', halt: 'Error: CelesTrak answered 403' }])
    expect(cycle.resume()).toBe('Error: CelesTrak answered 403')
    expect(await cycle.run(start)).toBe('stored')
  })

  it('returns nothing and logs nothing on a resume while the cycle runs', () => {
    const { cycle } = cycleOf(good)
    expect(cycle.resume()).toBeUndefined()
    expect(console.log).not.toHaveBeenCalled()
  })

  it('halts and logs again on a failure after a resume', async () => {
    const { cycle } = cycleOf(refused(403))
    await cycle.run(start)
    cycle.resume()
    expect(await cycle.run(start + EVERY)).toBe('halted')
    expect(logged()).toEqual([expect.objectContaining({ event: 'catalog.halted' }), expect.objectContaining({
      event : 'catalog.halted',
      time  : new Date(start + EVERY).toISOString()
    })])
  })
})
