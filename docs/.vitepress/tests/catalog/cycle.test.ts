import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as celestrak from '../../catalog/celestrak.ts'
import { Cycle, EVERY, LONGEST, REGIONS, type Region, type Wait } from '../../catalog/cycle.ts'
import * as catalog   from '../../lib/orbit/catalog.ts'
import full           from '../fixtures/records.json' with { type: 'json' }

const fixture = full as unknown as catalog.Record[]
const records = Array.from({ length: 5000 }, (_, row) => ({
  ...fixture[row % fixture.length],
  NORAD_CAT_ID: 100_000 + row
}))
const start = Date.parse('2026-11-10T00:00:00Z')

const SPACINGS = [[EVERY - 1, 'early'], [EVERY, 'stored']] as const
const BACKOFF  = [EVERY, 2 * EVERY, 4 * EVERY, 8 * EVERY, LONGEST, LONGEST]
const ASKED    = [
  ['the doubled wait', '60', EVERY],
  ['two days', String(2 * LONGEST / 1000), 2 * LONGEST],
  ['two days', new Date(start + 2 * LONGEST).toUTCString(), 2 * LONGEST],
  ['the doubled wait', new Date(start - LONGEST).toUTCString(), EVERY],
  ['the doubled wait', 'tomorrow', EVERY],
  ['until the latest time a date holds', '9'.repeat(20), 8.64e15 - start]
] as const
const HALTS    = [
  ['a record', { event: 'catalog.halted', kind: 'refused', reason: 'CelesTrak answered 403', status: 403 }],
  ['text', 'Error: CelesTrak answered 403']
] as const
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
  return { cycle, state, stored, fetcher, waited: () => state.get('wait') as Wait }
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

  it.each(REFUSALS)('waits two hours on a %i without trying another region, logging and keeping the refusal',
    async status => {
      const headers = { 'content-type': 'text/html', 'retry-after': '7200', 'set-cookie': 'session' }
      const { cycle, state, stored, fetcher } = cycleOf(() => new Response('Refused', { status, headers }))
      expect(await cycle.run(start)).toBe('waiting')
      expect(fetcher).toHaveBeenCalledOnce()
      expect(stored.size).toBe(0)
      const wait = {
        body     : 'Refused',
        event    : 'catalog.waiting',
        headers  : { 'content-type': 'text/html', 'retry-after': '7200' },
        kind     : 'refused',
        reason   : `CelesTrak answered ${status}`,
        refusals : 1,
        region   : REGIONS[0],
        status   : status,
        time     : new Date(start).toISOString(),
        until    : new Date(start + EVERY).toISOString()
      }
      expect(logged()).toEqual([wait])
      expect(state.get('wait')).toEqual(wait)
    })

  it('waits on a refusal whose body fails while it is read, asking CelesTrak once', async () => {
    const body = () => new ReadableStream({
      pull: controller => controller.error(new TypeError('Network connection lost'))
    })
    const { cycle, state, fetcher } = cycleOf(() => new Response(body(), { status: 403 }))
    expect(await cycle.run(start)).toBe('waiting')
    expect(await cycle.run(start + EVERY - 1)).toBe('waiting')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(state.get('wait')).toMatchObject({ kind: 'refused', region: REGIONS[0], status: 403 })
  })

  it.each([
    ['a list shorter than the active catalog', () => Response.json(records.slice(0, 10)), 'Expected a list'],
    ['a body that is not JSON', () => new Response('<html>'), 'JSON'],
    ['JSON that is not a list', () => Response.json({ error: 'busy' }), 'busy']
  ])('waits for the next scheduled run on %s, a catalog that fails its check', async (_, answer, reason) => {
    const { cycle, state } = cycleOf(answer)
    expect(await cycle.run(start)).toBe('waiting')
    expect(state.get('wait')).toMatchObject({
      kind     : 'unchecked',
      reason   : expect.stringContaining(reason),
      refusals : 0,
      region   : REGIONS[0],
      until    : new Date(start + EVERY).toISOString()
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
    expect(await cycle.run(start + EVERY)).toBe('waiting')
    answer = good
    fetcher.mockClear()
    expect(await cycle.run(start + 2 * EVERY)).toBe('stored')
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(REGIONS[1], celestrak.SOURCE, expect.anything())
  })

  it('waits on a status CelesTrak sends after moving to the next region, naming that region', async () => {
    const { cycle, state, fetcher } = cycleOf(region => refused(region === REGIONS[0] ? 522 : 403)())
    expect(await cycle.run(start)).toBe('waiting')
    expect(fetcher.mock.calls.map(([region]) => region)).toEqual(REGIONS.slice(0, 2))
    expect(state.get('wait')).toMatchObject({ kind: 'refused', region: REGIONS[1], status: 403 })
  })

  it('waits once no region reaches CelesTrak, naming the result of each region', async () => {
    const missOf  = (region: Region) => MISSES[REGIONS.indexOf(region) % MISSES.length]
    const results = REGIONS.map(region => [region, expect.stringContaining(missOf(region)[2])])
    const { cycle, state, fetcher } = cycleOf(region => missOf(region)[1]())
    expect(await cycle.run(start)).toBe('waiting')
    expect(fetcher).toHaveBeenCalledTimes(REGIONS.length)
    expect(state.get('wait')).toMatchObject({
      kind     : 'unreached',
      reason   : 'No region reached CelesTrak',
      refusals : 0,
      regions  : Object.fromEntries(results),
      until    : new Date(start + EVERY).toISOString()
    })
    expect(state.get('wait')).not.toHaveProperty('region')
  })

  it('waits where no headers arrive within the bound, trying no other region', async () => {
    vi.useFakeTimers()
    const { cycle, state, fetcher } = cycleOf(stall)
    const outcome = cycle.run(start)
    await vi.advanceTimersByTimeAsync(celestrak.HEADER_WAIT)
    expect(await outcome).toBe('waiting')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(state.get('wait')).toMatchObject({
      kind   : 'unanswered',
      reason : `No answer within ${celestrak.HEADER_WAIT} ms`,
      region : REGIONS[0]
    })
  })

  it('waits where the write to Workers KV fails, naming the region that reached CelesTrak', async () => {
    const { cycle, state, stored } = cycleOf(good, async () => { throw new Error('KV PUT failed: 500') })
    expect(await cycle.run(start)).toBe('waiting')
    expect(stored.size).toBe(0)
    expect(state.get('wait')).toMatchObject({
      kind   : 'unstored',
      reason : 'Error: KV PUT failed: 500',
      region : REGIONS[0]
    })
  })

  it('fails the run without a wait where the catalog fails outside the named kinds', async () => {
    const { cycle, state, stored } = cycleOf(() => Response.json(Array(5000).fill(0)))
    await expect(cycle.run(start)).rejects.toThrow(TypeError)
    expect(state.get('wait')).toBeUndefined()
    expect(stored.size).toBe(0)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('doubles the wait on each refusal in a row up to a day', async () => {
    const { cycle, fetcher, waited } = cycleOf(refused(403))
    const waits: number[] = []
    for (let time = start; waits.length < BACKOFF.length; time += waits.at(-1)!) {
      expect(await cycle.run(time)).toBe('waiting')
      waits.push(Date.parse(waited().until) - time)
    }
    expect(waits).toEqual(BACKOFF)
    expect(waited().refusals).toBe(BACKOFF.length)
    expect(fetcher).toHaveBeenCalledTimes(BACKOFF.length)
  })

  it.each(ASKED)('waits %s where retry-after reads %s on a first refusal', async (_, asked, wait) => {
    const headers          = { 'retry-after': asked }
    const { cycle, waited } = cycleOf(() => new Response(null, { status: 429, headers }))
    await cycle.run(start)
    expect(Date.parse(waited().until) - start).toBe(wait)
  })

  it('logs the stored wait again under an event of its own on each run it blocks, asking CelesTrak once',
    async () => {
      const { cycle, state, fetcher } = cycleOf(refused(403))
      await cycle.run(start)
      const wait = state.get('wait')
      expect(await cycle.run(start + 1)).toBe('waiting')
      expect(await cycle.run(start + EVERY - 1)).toBe('waiting')
      expect(fetcher).toHaveBeenCalledOnce()
      expect(logged()).toEqual([wait, ...Array(2).fill({ event: 'catalog.blocked', wait })])
    })

  it('ends the wait on its own once it runs out, logging the wait a download ends and starting over on '
   + 'the refusal after it', async () => {
    let answer = refused(403)
    const { cycle, state } = cycleOf(() => answer())
    await cycle.run(start)
    const wait = state.get('wait')
    answer = good
    expect(await cycle.run(start + EVERY)).toBe('stored')
    expect(state.get('wait')).toBeUndefined()
    expect(console.log).toHaveBeenCalledExactlyOnceWith({ event: 'catalog.recovered', wait })
    answer = refused(403)
    expect(await cycle.run(start + 2 * EVERY)).toBe('waiting')
    expect(state.get('wait')).toMatchObject({ refusals: 1, until: new Date(start + 3 * EVERY).toISOString() })
  })

  it('keeps the refusals in a row through a fault of another kind, which waits for the next run alone',
    async () => {
      let answer = refused(403)
      const { cycle, state, waited } = cycleOf(() => answer())
      await cycle.run(start)
      answer = () => Response.json({ error: 'busy' })
      await cycle.run(start + EVERY)
      expect(state.get('wait')).toMatchObject({ kind: 'unchecked', refusals: 1 })
      expect(waited().until).toBe(new Date(start + 2 * EVERY).toISOString())
      answer = refused(403)
      await cycle.run(start + 2 * EVERY)
      const until = new Date(start + 4 * EVERY).toISOString()
      expect(state.get('wait')).toMatchObject({ refusals: 2, until })
    })

  it.each(HALTS)('turns a halt stored as %s into a wait of two hours, asking CelesTrak nothing until it ends',
    async (_, halt) => {
      const { cycle, state, fetcher } = cycleOf(good)
      state.set('attempted', start - 3 * EVERY)
      state.set('halted', halt)
      expect(await cycle.run(start)).toBe('waiting')
      expect(fetcher).not.toHaveBeenCalled()
      expect(state.has('halted')).toBe(false)
      const wait = state.get('wait')
      expect(wait).toEqual({
        event    : 'catalog.waiting',
        halt     : halt,
        kind     : 'halted',
        reason   : 'The cycle halted before waits replaced halts',
        refusals : 0,
        time     : new Date(start).toISOString(),
        until    : new Date(start + EVERY).toISOString()
      })
      expect(logged()).toEqual([wait])
      expect(await cycle.run(start + EVERY - 1)).toBe('waiting')
      expect(await cycle.run(start + EVERY)).toBe('stored')
    })
})

