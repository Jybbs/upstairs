import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as celestrak     from '../../catalog/celestrak.ts'
import { Cycle, EVERY, LONGEST, REGIONS, type Region, type Wait } from '../../catalog/cycle.ts'
import * as catalog       from '../../lib/orbit/catalog.ts'
import { unchangedBody } from '../common/celestrak.ts'
import full               from '../fixtures/records.json' with { type: 'json' }

const fixture = full as unknown as catalog.Record[]
const records = Array.from({ length: 5000 }, (_, row) => ({
  ...fixture[row % fixture.length],
  NORAD_CAT_ID: 100_000 + row
}))
const start  = Date.parse('2026-11-10T00:00:00Z')
const MINUTE = 60_000

const SPACINGS = [[EVERY - MINUTE - 1, 'early'], [EVERY - MINUTE, 'stored']] as const
const BACKOFF  = [EVERY, 2 * EVERY, 4 * EVERY, 8 * EVERY, LONGEST, LONGEST]
const ASKED    = [
  ['the doubled wait', '60', EVERY],
  ['twelve hours', String(6 * EVERY / 1000), 6 * EVERY],
  ['a day', String(2 * LONGEST / 1000), LONGEST],
  ['a day', new Date(start + 2 * LONGEST).toUTCString(), LONGEST],
  ['the doubled wait', new Date(start - LONGEST).toUTCString(), EVERY],
  ['the doubled wait', 'tomorrow', EVERY],
  ['a day', '9'.repeat(20), LONGEST]
] as const
const halted   = { event: 'catalog.halted', kind: 'refused', reason: 'CelesTrak answered 403', status: 403 }
const HALTS    = [
  ['a record an hour old', { ...halted, time: new Date(start - EVERY / 2).toISOString() }, start - EVERY / 2],
  ['a record holding no time', halted, start],
  ['text', 'Error: CelesTrak answered 403', start]
] as const
const REFUSALS  = [301, 403, 404, 500, 503, 520]
const refused   = (status: number) => () => new Response(null, { status })
const clockOf   = (time: number) => new Date(time).toISOString().slice(0, 19).replace('T', ' ')
const unchanged = (since: number, headers?: HeadersInit) => () =>
  new Response(unchangedBody(clockOf(since)), { headers, status: 403 })
const MISSES    = [
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
  const run   = (time: number, late = 0) => {
    vi.setSystemTime(time + late)
    return cycle.run(time)
  }
  return { cycle: { run }, state, stored, fetcher, waited: () => state.get('wait') as Wait }
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
    expect(await cycle.run(start + EVERY - MINUTE - 1)).toBe('waiting')
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
    expect(state.get('downloaded')).toBe(start)
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
    expect([state.get('aborted'), state.get('downloaded')]).toEqual([start, undefined])
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
    expect(state.get('downloaded')).toBe(start)
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

  it('doubles the wait on each refusal since the last download that succeeded, up to a day', async () => {
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
      expect(await cycle.run(start + EVERY - MINUTE - 1)).toBe('waiting')
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

  it('counts the refusals through a fault of another kind, which waits for the next run alone',
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

  it('waits until two hours past its own download after a 403 for data that has not updated, keeping '
   + 'the refusal count where it stood', async () => {
    const own  = start - EVERY + 30_000
    let answer = unchanged(own)
    const { cycle, state, fetcher, waited } = cycleOf(() => answer())
    state.set('downloaded', start - EVERY)
    expect(await cycle.run(start)).toBe('waiting')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(logged()).toEqual([waited()])
    expect(waited()).toMatchObject({
      kind     : 'unchanged',
      reason   : 'CelesTrak answered 403',
      refusals : 0,
      since    : new Date(own).toISOString(),
      status   : 403,
      until    : new Date(own + EVERY).toISOString()
    })
    answer = refused(403)
    await cycle.run(start + EVERY)
    answer = unchanged(own)
    await cycle.run(start + 2 * EVERY)
    const now = new Date(start + 2 * EVERY).toISOString()
    expect(waited()).toMatchObject({ kind: 'unchanged', refusals: 1, until: now })
    answer = refused(403)
    await cycle.run(start + 3 * EVERY)
    const doubled = new Date(start + 5 * EVERY).toISOString()
    expect(waited()).toMatchObject({ kind: 'refused', refusals: 2, until: doubled })
  })

  it('waits for the first run two hours past the download it made, after a 403 naming that download',
    async () => {
      let answer = good
      const { cycle, fetcher } = cycleOf(() => answer())
      await cycle.run(start)
      answer = unchanged(start + 5_000)
      expect(await cycle.run(start + EVERY)).toBe('waiting')
      expect(await cycle.run(start + EVERY + MINUTE)).toBe('early')
      answer = good
      expect(await cycle.run(start + 2 * EVERY)).toBe('stored')
      expect(fetcher.mock.calls.map(([region]) => region)).toEqual(Array(3).fill(REGIONS[0]))
    })

  it.each([
    ['a minute after', 1, MINUTE],
    ['a minute and a second after', REGIONS.length, MINUTE + 1000],
    ['a minute before', 1, -MINUTE],
    ['a minute and a second before', 1, -MINUTE - 1000],
    ['half an hour before', 1, -30 * MINUTE]
  ])('reads a 403 naming a download %s the one the cycle made as another client\'s only past a '
   + 'minute after it, asking %i regions', async (_, asked, offset) => {
    let answer = good
    const { cycle, fetcher } = cycleOf(() => answer())
    await cycle.run(start)
    fetcher.mockClear()
    answer = unchanged(start + offset)
    expect(await cycle.run(start + EVERY)).toBe('waiting')
    expect(fetcher).toHaveBeenCalledTimes(asked)
  })

  it.each([
    ['a catalog', good],
    ['a catalog that fails its check', () => Response.json(records.slice(0, 10))]
  ])('reads a 403 naming the time a late run sent the request answered with %s as its own download',
    async (_, first) => {
      const late = 24 * MINUTE
      let answer = first
      const { cycle, state, fetcher } = cycleOf(() => answer())
      await cycle.run(start, late)
      expect(state.get('downloaded')).toBe(start + late)
      fetcher.mockClear()
      answer = unchanged(start + late)
      expect(await cycle.run(start + EVERY)).toBe('waiting')
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(REGIONS[0], celestrak.SOURCE, expect.anything())
    })

  it('dates a download after regions that failed to connect by the time its own request was sent',
    async () => {
      const CONNECT = 19_000
      const { cycle, state } = cycleOf(region => {
        if (region === REGIONS.at(-1)) return good()
        vi.setSystemTime(Date.now() + CONNECT)
        return refused(522)()
      })
      expect(await cycle.run(start)).toBe('stored')
      expect(state.get('downloaded')).toBe(start + 4 * CONNECT)
    })

  it.each([
    ['a refusal', refused(403)],
    ['a 403 for data that has not updated', unchanged(start - EVERY)]
  ])('keeps the time of the last download and of the last request that timed out through %s',
    async (_, answer) => {
      const { cycle, state } = cycleOf(answer)
      state.set('aborted', start - EVERY)
      state.set('downloaded', start - EVERY)
      await cycle.run(start)
      expect([state.get('aborted'), state.get('downloaded')]).toEqual([start - EVERY, start - EVERY])
    })

  it('moves past a 403 naming a download the cycle did not make on the run after one whose next region '
   + 'timed out', async () => {
    vi.useFakeTimers()
    const other = unchanged(start - EVERY / 4)
    let answer  = (region: Region, init?: RequestInit) =>
      region === REGIONS[0] ? other() : stall(region, init)
    const { cycle, state, fetcher } = cycleOf((region, init) => answer(region, init))
    state.set('downloaded', start - EVERY)
    const outcome = cycle.run(start)
    await vi.advanceTimersByTimeAsync(celestrak.HEADER_WAIT)
    expect(await outcome).toBe('waiting')
    expect(fetcher.mock.calls.map(([region]) => region)).toEqual(REGIONS.slice(0, 2))
    answer = region => region === REGIONS[0] ? other() : good()
    fetcher.mockClear()
    expect(await cycle.run(start + EVERY)).toBe('stored')
    expect(fetcher.mock.calls.map(([region]) => region)).toEqual(REGIONS.slice(0, 2))
  })

  it.each([
    ['a minute after', 1, MINUTE],
    ['a minute before', 1, -MINUTE],
    ['a minute and a second after', REGIONS.length, MINUTE + 1000],
    ['a minute and a second before', REGIONS.length, -MINUTE - 1000]
  ])('reads a 403 naming a download %s a request a late run sent that timed out as its own only within '
   + 'a minute of it', async (_, asked, offset) => {
    vi.useFakeTimers()
    const late = 24 * MINUTE
    let answer: Parameters<typeof cycleOf>[0] = stall
    const { cycle, fetcher } = cycleOf((region, init) => answer(region, init))
    const outcome = cycle.run(start, late)
    await vi.advanceTimersByTimeAsync(celestrak.HEADER_WAIT)
    expect(await outcome).toBe('waiting')
    answer = unchanged(start + late + offset)
    fetcher.mockClear()
    expect(await cycle.run(start + EVERY)).toBe('waiting')
    expect(fetcher).toHaveBeenCalledTimes(asked)
  })

  it('downloads from the next region after a 403 naming a download the cycle did not make, and starts '
   + 'from that region on the next run', async () => {
    let answer = (region: Region) => region === REGIONS[0] ? unchanged(start - EVERY / 4)() : good()
    const { cycle, state, fetcher } = cycleOf(region => answer(region))
    expect(await cycle.run(start)).toBe('stored')
    expect(fetcher.mock.calls.map(([region]) => region)).toEqual(REGIONS.slice(0, 2))
    expect([state.get('downloaded'), state.get('reached')]).toEqual([start, REGIONS[1]])
    expect(state.has('wait')).toBe(false)
    answer = good
    fetcher.mockClear()
    await cycle.run(start + EVERY)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(REGIONS[1], celestrak.SOURCE, expect.anything())
  })

  it('asks each region once where each names a download the cycle did not make or fails to connect, '
   + 'waiting until two hours past the last download named', async () => {
    const other   = start - EVERY / 4
    const answers = [unchanged(other - 1000), refused(522), unchanged(other), unchanged(other), refused(523)]
    let answer = (region: Region) => answers[REGIONS.indexOf(region)]()
    const { cycle, fetcher, waited } = cycleOf(region => answer(region))
    expect(await cycle.run(start)).toBe('waiting')
    expect(fetcher.mock.calls.map(([region]) => region)).toEqual(REGIONS)
    expect(waited()).toMatchObject({
      kind     : 'unchanged',
      refusals : 0,
      region   : REGIONS[3],
      regions  : {
        [REGIONS[0]] : 'CelesTrak answered 403',
        [REGIONS[1]] : 'Cloudflare answered 522',
        [REGIONS[2]] : 'CelesTrak answered 403',
        [REGIONS[3]] : 'CelesTrak answered 403',
        [REGIONS[4]] : 'Cloudflare answered 523'
      },
      since    : new Date(other).toISOString(),
      until    : new Date(other + EVERY).toISOString()
    })
    answer = good
    expect(await cycle.run(start + EVERY)).toBe('stored')
  })

  it.each([
    ['a refusal', refused(403), 'refused'],
    ['a 403 naming no time', () => new Response(unchangedBody(''), { status: 403 }), 'unchanged']
  ])('waits two hours on %s from the region after one naming a download the cycle did not make',
    async (_, next, kind) => {
      const other                      = unchanged(start)
      const { cycle, fetcher, waited } = cycleOf(region => region === REGIONS[0] ? other() : next())
      expect(await cycle.run(start + MINUTE)).toBe('waiting')
      expect(fetcher).toHaveBeenCalledTimes(2)
      const until = new Date(start + MINUTE + EVERY).toISOString()
      expect(waited()).toMatchObject({ kind, region: REGIONS[1], until })
    })

  it.each([
    ['two hours after the download it names', start - EVERY / 2, start + EVERY / 2],
    ['two hours at most', start + EVERY, start + EVERY]
  ])('waits %s after a 403 for data that has not updated, whatever retry-after reads',
    async (_, own, until) => {
      const headers                  = { 'retry-after': String(LONGEST / 1000) }
      const { cycle, state, waited } = cycleOf(unchanged(own, headers))
      state.set('downloaded', own)
      await cycle.run(start)
      expect(waited()).toMatchObject({ kind: 'unchanged', until: new Date(until).toISOString() })
    })

  it.each([
    ['the last attempt', good, 'stored'],
    ['the end of a wait', refused(403), 'waiting']
  ])('downloads on a scheduled run seconds short of two hours after %s', async (_, answer, first) => {
    let next = answer
    const { cycle, fetcher } = cycleOf(() => next())
    expect(await cycle.run(start + 11_000)).toBe(first)
    next = good
    expect(await cycle.run(start + EVERY)).toBe('stored')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each(HALTS)('turns a halt stored as %s into a wait ending two hours after the halt, '
               + 'deleting the old keys', async (_, halt, at) => {
    const { cycle, state, fetcher } = cycleOf(good)
    state.set('alerted', true)
    state.set('attempted', start - 3 * EVERY)
    state.set('halted', halt)
    expect(await cycle.run(start)).toBe('waiting')
    expect(fetcher).not.toHaveBeenCalled()
    expect(['alerted', 'halted'].filter(key => state.has(key))).toEqual([])
    const wait = state.get('wait')
    expect(wait).toEqual({
      event    : 'catalog.waiting',
      halt     : halt,
      kind     : 'halted',
      reason   : 'The cycle halted before waits replaced halts',
      refusals : 0,
      time     : new Date(at).toISOString(),
      until    : new Date(at + EVERY).toISOString()
    })
    expect(logged()).toEqual([wait])
    expect(await cycle.run(at + EVERY - MINUTE - 1)).toBe('waiting')
    expect(await cycle.run(at + EVERY - MINUTE)).toBe('stored')
  })

  it.each([
    ['more than two hours', EVERY + 1],
    ['seconds short of two hours', EVERY - 11_000]
  ])('downloads on the first run after a halt recorded %s before it', async (_, age) => {
    const { cycle, state, fetcher } = cycleOf(good)
    state.set('attempted', start - 3 * EVERY)
    state.set('halted', { ...halted, time: new Date(start - age).toISOString() })
    expect(await cycle.run(start)).toBe('stored')
    expect(fetcher).toHaveBeenCalledOnce()
    expect([state.has('halted'), state.has('wait')]).toEqual([false, false])
    expect(console.log)
      .toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ event: 'catalog.recovered' }))
  })
})
