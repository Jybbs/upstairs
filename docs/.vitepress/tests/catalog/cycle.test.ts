import { afterEach, describe, expect, it, vi } from 'vitest'

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
  answer      : (region: Region, init?: RequestInit) => Response | Promise<Response>,
  failedSends = 0
) => {
  const state   = new Map<string, unknown>()
  const stored  = new Map<string, unknown>()
  const sent: { subject: string, text: string }[] = []
  const fetcher = vi.fn(async (region: Region, _source: RequestInfo | URL, init?: RequestInit) =>
    answer(region, init))
  const storage = {
    delete : (key: string) => state.delete(key),
    get    : <T>(key: string) => state.get(key) as T,
    put    : (key: string, value: unknown) => { state.set(key, value) }
  }
  const send = async (message: { subject: string, text: string }) => {
    if (failedSends-- > 0) throw new Error('E_RECIPIENT_NOT_ALLOWED')
    sent.push(message)
    return { messageId: '' }
  }
  const cycle = new Cycle(storage, {
    ALERT_FROM : 'catalog@upstairs.fyi',
    ALERT_TO   : 'someone@example.com',
    CATALOG    : { put: async (key: string, value: unknown) => void stored.set(key, value) },
    EMAIL      : { send } as unknown as Pick<SendEmail, 'send'>
  }, region => celestrak.fetchCatalog((source, init) => fetcher(region, source, init)))
  return { cycle, state, stored, sent, fetcher }
}

const good  = () => Response.json(records)
const stall = (_: Region, init?: RequestInit) => new Promise<Response>((_, reject) =>
  init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)))

describe('a download cycle', () => {
  afterEach(() => { vi.useRealTimers() })

  it('stores the catalog it downloads, asking CelesTrak once with redirects left unfollowed', async () => {
    const { cycle, stored, fetcher } = cycleOf(good)
    expect(await cycle.run(start)).toBe('stored')
    expect(stored.get(catalog.FILE)).toBeInstanceOf(Uint8Array)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      REGIONS[0], celestrak.SOURCE, expect.objectContaining({ redirect: 'manual' })
    )
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

  it.each(REFUSALS)('halts on a %i without trying another region, sending the alert', async status => {
    const { cycle, state, stored, sent, fetcher } = cycleOf(refused(status))
    expect(await cycle.run(start)).toBe('halted')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(stored.size).toBe(0)
    expect(state.get('halted')).toContain(String(status))
    expect(sent).toEqual([expect.objectContaining({ text: expect.stringContaining(String(status)) })])
  })

  it.each([
    ['a list shorter than the active catalog', () => Response.json(records.slice(0, 10)), 'Expected a list'],
    ['a body that is not JSON', () => new Response('<html>'), 'JSON'],
    ['JSON that is not a list', () => Response.json({ error: 'busy' }), 'busy']
  ])('halts on %s', async (_, answer, reason) => {
    const { cycle, sent } = cycleOf(answer)
    expect(await cycle.run(start)).toBe('halted')
    expect(sent[0].text).toContain(reason)
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

  it('halts on a status CelesTrak sends after moving to the next region, trying no third', async () => {
    const { cycle, sent, fetcher } = cycleOf(region => refused(region === REGIONS[0] ? 522 : 403)())
    expect(await cycle.run(start)).toBe('halted')
    expect(fetcher.mock.calls.map(([region]) => region)).toEqual(REGIONS.slice(0, 2))
    expect(sent[0].text).toContain('CelesTrak answered 403')
  })

  it('halts once no region reaches CelesTrak, naming the result of each in the alert', async () => {
    const missOf = (region: Region) => MISSES[REGIONS.indexOf(region) % MISSES.length]
    const { cycle, sent, fetcher } = cycleOf(region => missOf(region)[1]())
    expect(await cycle.run(start)).toBe('halted')
    expect(fetcher).toHaveBeenCalledTimes(REGIONS.length)
    expect(sent[0].text.split('\n').slice(1, 1 + REGIONS.length)).toEqual(
      REGIONS.map(region => expect.stringMatching(`^${region}: .*${missOf(region)[2]}`))
    )
  })

  it('halts where no headers arrive within the bound, trying no other region', async () => {
    vi.useFakeTimers()
    const { cycle, sent, fetcher } = cycleOf(stall)
    const outcome = cycle.run(start)
    await vi.advanceTimersByTimeAsync(celestrak.HEADER_WAIT)
    expect(await outcome).toBe('halted')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(sent[0].text).toContain(`No answer within ${celestrak.HEADER_WAIT} ms`)
  })

  it('stays halted through later cycles until resumed', async () => {
    let answer = refused(403)
    const { cycle, fetcher } = cycleOf(() => answer())
    await cycle.run(start)
    expect(await cycle.run(start + 2 * EVERY)).toBe('halted')
    expect(fetcher).toHaveBeenCalledTimes(1)
    answer = good
    cycle.resume()
    expect(await cycle.run(start + 3 * EVERY)).toBe('stored')
  })
  it('sends the alert again on each halted run until a send succeeds, asking CelesTrak once', async () => {
    const { cycle, sent, fetcher } = cycleOf(refused(403), 2)
    await expect(cycle.run(start)).rejects.toThrow('E_RECIPIENT_NOT_ALLOWED')
    await expect(cycle.run(start + EVERY)).rejects.toThrow('E_RECIPIENT_NOT_ALLOWED')
    expect(sent).toHaveLength(0)
    expect(await cycle.run(start + 2 * EVERY)).toBe('halted')
    expect(sent).toEqual([expect.objectContaining({ text: expect.stringContaining('403') })])
    expect(await cycle.run(start + 3 * EVERY)).toBe('halted')
    expect(sent).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('alerts again on a failure after a resume', async () => {
    const { cycle, sent } = cycleOf(refused(403))
    await cycle.run(start)
    cycle.resume()
    expect(await cycle.run(start + EVERY)).toBe('halted')
    expect(sent).toHaveLength(2)
  })
})
