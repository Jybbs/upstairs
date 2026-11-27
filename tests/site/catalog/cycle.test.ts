import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as celestrak          from '../../../docs/.vitepress/catalog/celestrak.ts'
import * as cycles             from '../../../docs/.vitepress/catalog/cycle.ts'
import * as spacetrack         from '../../../docs/.vitepress/catalog/spacetrack.ts'
import * as catalog            from '../../../docs/.vitepress/lib/orbit/catalog.ts'
import { QUERIED, contentsOf } from '../common/catalog.ts'
import * as answers            from '../common/celestrak.ts'
import { LOST, stopping }      from '../common/fetchers.ts'
import * as replies            from '../common/spacetrack.ts'

type Answer = (region: cycles.Region, source: string, init?: RequestInit) => Response | Promise<Response>

const { DIRECTORY, SATCAT }       = celestrak
const { EVERY, LONGEST, REGIONS } = cycles
const start                       = Date.parse('2026-11-10T00:53:00Z')
const LISTED                      = start - 3 * EVERY
const MINUTE                      = 60_000
const LOGIN                       = { identity: 'observer', password: 'orbit 2026&more' }
const SECRETS                     = {
  [spacetrack.SECRETS.identity] : LOGIN.identity,
  [spacetrack.SECRETS.password] : LOGIN.password
}

/**
 * A text naming the login, as an error or an answer might.
 */
const NAMED    = `${LOGIN.identity} ${LOGIN.password}`
const SPACINGS = [[EVERY - MINUTE - 1, 'early'], [EVERY - MINUTE, 'current']] as const
const BACKOFF  = [EVERY, 2 * EVERY, 4 * EVERY, 8 * EVERY, 16 * EVERY, LONGEST, LONGEST]
const ASKED    = [
  ['the doubled wait', '60', EVERY],
  ['twelve hours', String(12 * EVERY / 1000), 12 * EVERY],
  ['a day', String(2 * LONGEST / 1000), LONGEST],
  ['a day', new Date(start + 2 * LONGEST).toUTCString(), LONGEST],
  ['the doubled wait', new Date(start - LONGEST).toUTCString(), EVERY],
  ['the doubled wait', 'tomorrow', EVERY],
  ['a day', '9'.repeat(20), LONGEST]
] as const
const halted   = { event: 'catalog.halted', kind: 'refused', reason: 'CelesTrak answered 403', status: 403 }
const HALTS    = [
  ['a record half an hour old', { ...halted, time: new Date(start - EVERY / 2).toISOString() },
    start - EVERY / 2],
  ['a record holding no time', halted, start],
  ['text', 'Error: CelesTrak answered 403', start]
] as const
const REFUSALS  = [301, 403, 404, 500, 503, 520]
const SATCAT_OK = answers.satcatBody(QUERIED.map(record => [record.NORAD_CAT_ID, 'PAY', '+']))
const refused   = (status: number) => () => new Response(null, { status })
const unchanged = (since: number, headers?: HeadersInit) => () =>
  new Response(answers.unchangedBody(answers.mtimeOf(since)), { headers, status: 403 })
const MISSES    = [
  ['Cloudflare answers 521', refused(521), '521'],
  ['Cloudflare answers 522', refused(522), '522'],
  ['Cloudflare answers 523', refused(523), '523'],
  ['the request throws', () => { throw LOST }, LOST.message]
] as const

/**
 * Answers the directory with a listing of the SATCAT file at `listed` and the
 * SATCAT file with `satcat`.
 */
const servedOf = (listed = LISTED, satcat = SATCAT_OK): Answer => (_, source) =>
  new Response(source === DIRECTORY ? answers.directoryBody(listed) : satcat)

const good  = servedOf()
const stall = (_: unknown, __: unknown, init?: RequestInit) => new Promise<Response>((_, reject) =>
  init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)))

const cycleOf = (
  answer : Answer,
  {
    elements = async () => QUERIED,
    env      = SECRETS as Partial<typeof SECRETS>,
    write    = async () => {}
  }: {
    elements? : spacetrack.SpaceTrack['elements']
    env?      : Partial<typeof SECRETS>
    write?    : () => Promise<void>
  } = {}
) => {
  const state      = new Map<string, unknown>()
  const stored     = new Map<string, unknown>()
  const fetcher    = vi.fn(async (region: cycles.Region, source: string, init?: RequestInit) =>
    answer(region, source, init))
  const storage    = {
    delete : (key: string) => state.delete(key),
    get    : <T>(key: string) => state.get(key) as T,
    put    : (key: string, value: unknown) => void state.set(key, value)
  }
  const put        = (key: string, value: unknown) => write().then(() => void stored.set(key, value))
  const spaceTrack = { elements: vi.fn(elements) }
  const cycle      = new cycles.Cycle(storage, { CATALOG: { put }, ...env }, (region, source) =>
    celestrak.fetchFrom((url, init) => fetcher(region, String(url), init), source), spaceTrack)
  const run        = (time: number, late = 0) => {
    vi.setSystemTime(time + late)
    return cycle.run(time)
  }
  const asked      = () => fetcher.mock.calls.map(([region, source]) => [region, source])
  const waited     = () => state.get('wait') as cycles.Wait
  return { asked, cycle: { run }, fetcher, spaceTrack, state, stored, waited }
}

const countOf = async (file: unknown) => (await contentsOf(file)).records.length

/**
 * Queries the elements as the client does, Space-Track answering with `given`.
 */
const answeredBy = (...given: (() => Response)[]): spacetrack.SpaceTrack['elements'] => (login, unclosed) =>
  new spacetrack.SpaceTrack(replies.answering(...given)).elements(login, unclosed)

const logged = () => vi.mocked(console.error).mock.calls.map(([entry]) => entry)

describe('the payloads a catalog keeps', () => {
  it.each<[string | undefined, boolean]>([
    ['+', true], ['P', true], ['B', true], ['S', true], ['X', true],
    ['-', false], ['D', false], ['?', false], ['', false], [undefined, false]
  ])('keeps a payload whose operational status reads %j: %s', (code, kept) => {
    const codes = code === undefined ? {} : { [QUERIED[0].NORAD_CAT_ID]: code }
    expect(cycles.activeOf(codes, QUERIED.slice(0, 1))).toHaveLength(Number(kept))
  })
})

describe('a download cycle', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('downloads the SATCAT once its directory lists a file, asking CelesTrak with redirects left '
   + 'unfollowed, and stores the elements Space-Track serves for its active payloads', async () => {
    const { asked, cycle, fetcher, spaceTrack, state, stored } = cycleOf(good)
    expect(await cycle.run(start)).toEqual({ elements: 'stored', satcat: 'downloaded' })
    expect(asked()).toEqual([[REGIONS[0], DIRECTORY], [REGIONS[0], SATCAT]])
    for (const [, , init] of fetcher.mock.calls) expect(init).toMatchObject({ redirect: 'manual' })
    expect(spaceTrack.elements).toHaveBeenCalledExactlyOnceWith(LOGIN, expect.any(Function))
    expect(state.get('satcat')).toMatchObject({ time: LISTED })
    expect(await countOf(stored.get(catalog.FILE))).toBe(QUERIED.length)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('dates the stored file by the time the cycle ran', async () => {
    const { cycle, stored } = cycleOf(good)
    await cycle.run(start)
    expect((await contentsOf(stored.get(catalog.FILE))).fetched).toBe(start)
  })

  it.each([
    ['the same file', LISTED, 'current', [DIRECTORY]],
    ['an older file', LISTED - 1000, 'current', [DIRECTORY]],
    ['a newer file', LISTED + 1000, 'downloaded', [DIRECTORY, SATCAT]]
  ])('reads the directory listing %s on the next run, downloading SATCAT only for a newer one',
    async (_, listed, outcome, sources) => {
      let answer = good
      const { asked, cycle, fetcher, spaceTrack } = cycleOf((...args) => answer(...args))
      await cycle.run(start)
      fetcher.mockClear()
      answer = servedOf(listed)
      expect(await cycle.run(start + EVERY)).toEqual({ elements: 'stored', satcat: outcome })
      expect(asked()).toEqual(sources.map(source => [REGIONS[0], source]))
      expect(spaceTrack.elements).toHaveBeenCalledTimes(2)
    })

  it('stores the elements of only the payloads the SATCAT marks active, leaving out one it has no row for',
    async () => {
      const records = [0, 1, 2].flatMap(copy => QUERIED.map(record =>
        ({ ...record, NORAD_CAT_ID: record.NORAD_CAT_ID + copy * QUERIED.length })))
      const listed  = records.slice(0, -100).map(({ NORAD_CAT_ID: id }, row) =>
        [id, 'PAY', row % 2 ? '-' : cycles.ACTIVE[row % cycles.ACTIVE.length]] as const)
      const rows    = [...listed, ...Array.from({ length: 100 }, (_, row) => [row + 1, 'PAY', '+'] as const)]
      const { cycle, stored } = cycleOf(servedOf(LISTED, answers.satcatBody(rows)), {
        elements: async () => records
      })
      await cycle.run(start)
      expect(await countOf(stored.get(catalog.FILE))).toBe((records.length - 100) / 2)
    })

  it('keeps no code for an object SATCAT lists as other than a payload', async () => {
    const rows = [...QUERIED.map(record => [record.NORAD_CAT_ID, 'PAY', '+'] as const),
      [7, 'R/B', '+'] as const]
    const { cycle, state } = cycleOf(servedOf(LISTED, answers.satcatBody(rows)))
    await cycle.run(start)
    expect(state.get('satcat')).not.toHaveProperty('codes.7')
  })

  it.each(SPACINGS)('answers a run %i ms after the last as %s', async (after, outcome) => {
    const { cycle, spaceTrack } = cycleOf(good)
    await cycle.run(start)
    const result = await cycle.run(start + after)
    expect(result === 'early' ? result : result.satcat).toBe(outcome)
    expect(spaceTrack.elements).toHaveBeenCalledTimes(outcome === 'early' ? 1 : 2)
  })

  it('stores none and queries Space-Track for nothing while no SATCAT is kept', async () => {
    const { cycle, spaceTrack, stored } = cycleOf(refused(403))
    expect(await cycle.run(start)).toEqual({ elements: 'failed', satcat: 'waiting' })
    expect(spaceTrack.elements).not.toHaveBeenCalled()
    expect(stored.size).toBe(0)
    expect(logged()).toContainEqual({
      event  : 'catalog.failed',
      kind   : 'unsorted',
      reason : 'No SATCAT is kept yet',
      time   : new Date(start).toISOString()
    })
  })

  it('queries Space-Track on the SATCAT kept through a run a CelesTrak wait blocks', async () => {
    let answer: Answer = good
    const { cycle, stored } = cycleOf((...args) => answer(...args))
    await cycle.run(start)
    answer = refused(403)
    await cycle.run(start + EVERY)
    stored.clear()
    expect(await cycle.run(start + 2 * EVERY - MINUTE)).toEqual({ elements: 'stored', satcat: 'waiting' })
    expect(stored.has(catalog.FILE)).toBe(true)
  })

  it.each([
    ['a rejected login', new spacetrack.Rejected('Space-Track rejected the login'), 'rejected'],
    ['a failed request', new spacetrack.Unavailable('Space-Track answered 503'), 'unavailable'],
    ['an answer that is not a catalog', new spacetrack.Unchecked('Expected a list'), 'unchecked']
  ])('logs one structured error on %s and keeps the stored file', async (_, error, kind) => {
    let elements = async () => QUERIED
    const { cycle, stored } = cycleOf(good, { elements: () => elements() })
    await cycle.run(start)
    const file = stored.get(catalog.FILE)
    elements = async () => { throw error }
    expect(await cycle.run(start + EVERY)).toEqual({ elements: 'failed', satcat: 'current' })
    expect(stored.get(catalog.FILE)).toBe(file)
    expect(logged()).toEqual([
      { event: 'catalog.failed', kind, reason: error.message, time: new Date(start + EVERY).toISOString() }
    ])
  })

  it.each([
    ['shares no catalog number with the SATCAT kept', QUERIED.map(record => ({
      ...record, NORAD_CAT_ID: record.NORAD_CAT_ID + QUERIED.length
    }))],
    ['holds one active payload too few', QUERIED.slice(1)]
  ])('keeps the stored file where an answer %s', async (_, records) => {
    let elements = async () => QUERIED
    const { cycle, stored } = cycleOf(good, { elements: () => elements() })
    await cycle.run(start)
    const file = stored.get(catalog.FILE)
    elements = async () => records
    expect(await cycle.run(start + EVERY)).toEqual({ elements: 'failed', satcat: 'current' })
    expect(stored.get(catalog.FILE)).toBe(file)
    expect(logged()).toEqual([expect.objectContaining({ event: 'catalog.failed', kind: 'unchecked' })])
  })

  it.each([
    ['the username', { [spacetrack.SECRETS.password]: LOGIN.password }],
    ['the password', { [spacetrack.SECRETS.identity]: LOGIN.identity }]
  ])('queries nothing where %s of the Space-Track login is not set', async (_, env) => {
    const { cycle, spaceTrack, stored } = cycleOf(good, { env })
    expect(await cycle.run(start)).toEqual({ elements: 'failed', satcat: 'downloaded' })
    expect(spaceTrack.elements).not.toHaveBeenCalled()
    expect(stored.size).toBe(0)
    expect(logged()).toEqual([expect.objectContaining({ event: 'catalog.failed', kind: 'unset' })])
  })

  it('logs one structured error where the write to Workers KV fails', async () => {
    const { cycle, stored } = cycleOf(good, { write: async () => { throw new Error('KV PUT failed: 500') } })
    expect(await cycle.run(start)).toEqual({ elements: 'failed', satcat: 'downloaded' })
    expect(stored.size).toBe(0)
    expect(logged())
      .toEqual([expect.objectContaining({ kind: 'unstored', reason: 'Error: KV PUT failed: 500' })])
  })

  it('logs one structured error where the encoder refuses a record', async () => {
    const records = QUERIED.map((record, row) => row ? record : { ...record, ECCENTRICITY: 1e-30 })
    const { cycle, stored } = cycleOf(good, { elements: async () => records })
    expect(await cycle.run(start)).toEqual({ elements: 'failed', satcat: 'downloaded' })
    expect(stored.size).toBe(0)
    expect(logged())
      .toEqual([expect.objectContaining({ event: 'catalog.failed', reason: expect.stringContaining('no decimal form') })])
  })

  it('stores the elements a query returned where the logout fails, logging the logout', async () => {
    const elements = answeredBy(replies.ACCEPTED, replies.json(QUERIED), refused(500))
    const { cycle, stored } = cycleOf(good, { elements })
    expect(await cycle.run(start)).toEqual({ elements: 'stored', satcat: 'downloaded' })
    expect(await countOf(stored.get(catalog.FILE))).toBe(QUERIED.length)
    expect(logged()).toEqual([{
      event: 'catalog.unclosed', reason: 'Space-Track answered 500', time: new Date(start).toISOString()
    }])
  })

  it('names the failure of the query where the query and the logout both fail', async () => {
    const elements  = answeredBy(replies.ACCEPTED, refused(503), refused(500))
    const { cycle } = cycleOf(good, { elements })
    expect(await cycle.run(start)).toEqual({ elements: 'failed', satcat: 'downloaded' })
    const time = new Date(start).toISOString()
    expect(logged()).toEqual([
      { event: 'catalog.unclosed', reason: 'Space-Track answered 500', time },
      { event: 'catalog.failed', kind: 'unavailable', reason: 'Space-Track answered 503', time }
    ])
  })

  it('logs a body that stops arriving as Space-Track being unavailable', async () => {
    const stopped   = stopping('[{"OBJECT', LOST)
    const { cycle } = cycleOf(good, { elements: answeredBy(replies.ACCEPTED, stopped, replies.LOGGED) })
    expect(await cycle.run(start)).toMatchObject({ elements: 'failed' })
    expect(logged()).toEqual([expect.objectContaining({ event: 'catalog.failed', kind: 'unavailable' })])
  })

  it.each<[string, (() => Response)[]]>([
    ['the login is rejected', [replies.REJECTED]],
    ['the login fails on an error naming it', [() => { throw new TypeError(NAMED) }]],
    ['the login is answered with a page naming it', [() => new Response(NAMED)]],
    ['the query is answered with a page naming it', [replies.ACCEPTED, () => new Response(NAMED),
      replies.LOGGED]],
    ['the query is answered with an object naming it', [replies.ACCEPTED,
      replies.json({ error: NAMED }), replies.LOGGED]],
    ['the query is answered with a list naming it', [replies.ACCEPTED, replies.json([NAMED]),
      replies.LOGGED]],
    ['the query stops arriving on an error naming it', [replies.ACCEPTED,
      stopping(NAMED, new TypeError(NAMED)), replies.LOGGED]],
    ['the logout fails on an error naming it', [replies.ACCEPTED, replies.json(QUERIED),
      () => { throw new TypeError(NAMED) }]]
  ])('keeps the account and the password of the login out of every record where %s', async (_, given) => {
    const { cycle } = cycleOf(good, { elements: answeredBy(...given) })
    await cycle.run(start)
    const records = JSON.stringify([vi.mocked(console.error).mock.calls, vi.mocked(console.log).mock.calls])
    expect(console.error).toHaveBeenCalledOnce()
    expect(records).not.toContain(LOGIN.identity)
    expect(records).not.toContain(LOGIN.password)
  })

  it('fails the run where the query fails outside the named kinds', async () => {
    const { cycle, stored } = cycleOf(good, { elements: async () => { throw new TypeError('broken') } })
    await expect(cycle.run(start)).rejects.toThrow(TypeError)
    expect(stored.size).toBe(0)
  })

  it('rejects the run where keeping the SATCAT fails, starting no wait', async () => {
    const { cycle, state } = cycleOf(good)
    const set              = state.set.bind(state)
    vi.spyOn(state, 'set').mockImplementation((key, value) => {
      if (key === 'satcat') throw new RangeError('Storage value too large')
      return set(key, value)
    })
    await expect(cycle.run(start)).rejects.toThrow(RangeError)
    expect(state.has('wait')).toBe(false)
  })

  it.each(REFUSALS)('waits an hour on a %i without trying another region, logging and keeping the refusal',
    async status => {
      const headers = { 'content-type': 'text/html', 'retry-after': '3600', 'set-cookie': 'session' }
      const { cycle, state, fetcher } = cycleOf(() => new Response('Refused', { status, headers }))
      expect(await cycle.run(start)).toMatchObject({ satcat: 'waiting' })
      expect(fetcher).toHaveBeenCalledOnce()
      const wait = {
        body     : 'Refused',
        event    : 'catalog.waiting',
        headers  : { 'content-type': 'text/html', 'retry-after': '3600' },
        kind     : 'refused',
        reason   : `CelesTrak answered ${status}`,
        refusals : 1,
        region   : REGIONS[0],
        status   : status,
        time     : new Date(start).toISOString(),
        until    : new Date(start + EVERY).toISOString()
      }
      expect(logged()[0]).toEqual(wait)
      expect(state.get('wait')).toEqual(wait)
    })

  it('waits on a refusal of the SATCAT file after the directory listed it, keeping the SATCAT unchanged',
    async () => {
      const { asked, cycle, state } = cycleOf((region, source) =>
        source === DIRECTORY ? good(region, source) : refused(429)())
      expect(await cycle.run(start)).toMatchObject({ satcat: 'waiting' })
      expect(asked()).toEqual([[REGIONS[0], DIRECTORY], [REGIONS[0], SATCAT]])
      expect(state.has('satcat')).toBe(false)
      expect(state.get('wait')).toMatchObject({ kind: 'refused', status: 429 })
    })

  it('waits on a refusal whose body fails while it is read, asking CelesTrak once', async () => {
    const { cycle, state, fetcher } = cycleOf(stopping('', LOST, { status: 403 }))
    await cycle.run(start)
    expect(await cycle.run(start + EVERY - MINUTE - 1)).toBe('early')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(state.get('wait')).toMatchObject({ kind: 'refused', region: REGIONS[0], status: 403 })
  })

  it.each([
    ['a directory that is not JSON', () => new Response('<html>'), 'JSON'],
    ['a directory listing no SATCAT file', () => Response.json([{ FILE_NAME: 'satcat.txt' }]), 'satcat.csv'],
    ['a directory listing no time for it',
      () => new Response(answers.directoryBody(LISTED).replaceAll(' UTC"', '"')), 'satcat.csv'],
    ['a SATCAT file missing a column', servedOf(LISTED, 'OBJECT_NAME,NORAD_CAT_ID\r\n'), 'OPS_STATUS_CODE'],
    ['a SATCAT file holding too few payloads',
      servedOf(LISTED, answers.satcatBody([[1, 'PAY', '+']])), 'Expected 5000 or more payloads, got 1']
  ])('waits for the next scheduled run on %s, an answer that fails its check', async (_, answer, reason) => {
    const { cycle, state } = cycleOf(answer)
    expect(await cycle.run(start)).toMatchObject({ satcat: 'waiting' })
    expect(state.get('downloaded')).toBe(start)
    expect(state.has('satcat')).toBe(false)
    expect(state.get('wait')).toMatchObject({
      kind     : 'unchecked',
      reason   : expect.stringContaining(reason),
      refusals : 0,
      region   : REGIONS[0],
      until    : new Date(start + EVERY).toISOString()
    })
  })

  it.each([
    ['missing a column', 'OBJECT_NAME\r\n'],
    ['holding too few payloads', answers.satcatBody([[1, 'PAY', '+']])]
  ])('downloads a SATCAT file %s once for the time its directory lists, reading the directory on each run '
   + 'and logging the wait each starts', async (_, satcat) => {
    const { asked, cycle, fetcher, waited } = cycleOf(servedOf(LISTED, satcat))
    await cycle.run(start)
    const { reason } = waited()
    for (const hours of [1, 2, 3]) {
      fetcher.mockClear()
      expect(await cycle.run(start + hours * EVERY)).toEqual({ elements: 'failed', satcat: 'waiting' })
      expect(asked()).toEqual([[REGIONS[0], DIRECTORY]])
      expect(waited()).toEqual({
        event    : 'catalog.waiting',
        kind     : 'unchecked',
        reason   : reason,
        refusals : 0,
        region   : REGIONS[0],
        time     : new Date(start + hours * EVERY).toISOString(),
        until    : new Date(start + (hours + 1) * EVERY).toISOString()
      })
    }
  })

  it('names the region a SATCAT file failed its check through on a later run reading the directory '
   + 'through another region', async () => {
    let answer = servedOf(LISTED, 'OBJECT_NAME\r\n')
    const { asked, cycle, fetcher, state, waited } = cycleOf((...args) => answer(...args))
    await cycle.run(start)
    fetcher.mockClear()
    answer = (region, source) => {
      if (region === REGIONS[0]) throw LOST
      return good(region, source)
    }
    expect(await cycle.run(start + EVERY)).toMatchObject({ satcat: 'waiting' })
    expect(asked()).toEqual([[REGIONS[0], DIRECTORY], [REGIONS[1], DIRECTORY]])
    expect(state.get('reached')).toBe(REGIONS[1])
    expect(waited()).toMatchObject({ kind: 'unchecked', region: REGIONS[0] })
  })

  it.each([
    ['the same time', LISTED, 'waiting', [DIRECTORY]],
    ['an older time', LISTED - 1000, 'waiting', [DIRECTORY]],
    ['a newer time', LISTED + 1000, 'downloaded', [DIRECTORY, SATCAT]]
  ])('reads the directory listing %s on the run after a SATCAT file that fails its check, downloading '
   + 'SATCAT only for a newer one', async (_, listed, outcome, sources) => {
    let answer = servedOf(LISTED, 'OBJECT_NAME\r\n')
    const { asked, cycle, fetcher } = cycleOf((...args) => answer(...args))
    await cycle.run(start)
    fetcher.mockClear()
    answer = servedOf(listed)
    expect(await cycle.run(start + EVERY)).toMatchObject({ satcat: outcome })
    expect(asked()).toEqual(sources.map(source => [REGIONS[0], source]))
  })

  it('queries the elements on the SATCAT kept while a newer file fails its check', async () => {
    let answer = good
    const { cycle, spaceTrack, state, stored } = cycleOf((...args) => answer(...args))
    await cycle.run(start)
    answer = servedOf(LISTED + 1000, 'OBJECT_NAME\r\n')
    for (const hours of [1, 2]) {
      stored.clear()
      expect(await cycle.run(start + hours * EVERY)).toEqual({ elements: 'stored', satcat: 'waiting' })
      expect(await countOf(stored.get(catalog.FILE))).toBe(QUERIED.length)
    }
    expect(state.get('satcat')).toMatchObject({ time: LISTED })
    expect(spaceTrack.elements).toHaveBeenCalledTimes(3)
  })

  it('answers current once the directory lists the time of the SATCAT kept again after a newer file '
   + 'failed its check', async () => {
    let answer = good
    const { cycle } = cycleOf((...args) => answer(...args))
    await cycle.run(start)
    answer = servedOf(LISTED + 1000, 'OBJECT_NAME\r\n')
    await cycle.run(start + EVERY)
    answer = good
    expect(await cycle.run(start + 2 * EVERY)).toEqual({ elements: 'stored', satcat: 'current' })
  })

  it('downloads a SATCAT file whose body stopped arriving again on the next run', async () => {
    const stopped  = stopping('OBJECT_NAME\r\n', LOST)
    let answer: Answer = (region, source) => source === SATCAT ? stopped() : good(region, source)
    const { asked, cycle, fetcher } = cycleOf((...args) => answer(...args))
    expect(await cycle.run(start)).toMatchObject({ satcat: 'waiting' })
    fetcher.mockClear()
    answer = good
    expect(await cycle.run(start + EVERY)).toMatchObject({ satcat: 'downloaded' })
    expect(asked()).toEqual([[REGIONS[0], DIRECTORY], [REGIONS[0], SATCAT]])
  })

  it('reads a directory entry naming the SATCAT file by its path', async () => {
    const { cycle } = cycleOf((_, source) => new Response(source === DIRECTORY
      ? answers.directoryBody(LISTED, '/pub/satcat.csv')
      : SATCAT_OK))
    expect(await cycle.run(start)).toMatchObject({ satcat: 'downloaded' })
  })

  it.each(MISSES)('moves to the next region when %s', async (_, miss) => {
    const { asked, cycle } = cycleOf((region, source) =>
      region === REGIONS[0] ? miss() : good(region, source))
    expect(await cycle.run(start)).toMatchObject({ satcat: 'downloaded' })
    expect(asked()).toEqual([[REGIONS[0], DIRECTORY], [REGIONS[1], DIRECTORY], [REGIONS[1], SATCAT]])
  })

  it('reads the directory once a run where the SATCAT request moves to the next region', async () => {
    const { asked, cycle } = cycleOf((region, source) =>
      region === REGIONS[0] && source === SATCAT ? refused(522)() : good(region, source))
    expect(await cycle.run(start)).toMatchObject({ satcat: 'downloaded' })
    expect(asked()).toEqual([[REGIONS[0], DIRECTORY], [REGIONS[0], SATCAT], [REGIONS[1], SATCAT]])
  })

  it('starts each cycle from the region that last reached CelesTrak', async () => {
    const { asked, cycle, fetcher } = cycleOf((region, source) =>
      region === REGIONS[0] ? refused(522)() : good(region, source))
    await cycle.run(start)
    fetcher.mockClear()
    await cycle.run(start + EVERY)
    expect(asked()).toEqual([[REGIONS[1], DIRECTORY]])
  })

  it('starts from the first region where the stored region is no longer listed', async () => {
    const { asked, cycle, state } = cycleOf(good)
    state.set('reached', 'retired')
    await cycle.run(start)
    expect(asked()[0]).toEqual([REGIONS[0], DIRECTORY])
  })

  it('keeps the region that last reached CelesTrak through a cycle no region reaches', async () => {
    let answer: Answer = (region, source) => region === REGIONS[0] ? refused(522)() : good(region, source)
    const { asked, cycle, fetcher } = cycleOf((...args) => answer(...args))
    await cycle.run(start)
    answer = refused(522)
    expect(await cycle.run(start + EVERY)).toMatchObject({ satcat: 'waiting' })
    answer = good
    fetcher.mockClear()
    expect(await cycle.run(start + 2 * EVERY)).toMatchObject({ satcat: 'current' })
    expect(asked()).toEqual([[REGIONS[1], DIRECTORY]])
  })

  it('waits on a status CelesTrak sends after moving to the next region, naming that region', async () => {
    const { asked, cycle, state } = cycleOf(region => refused(region === REGIONS[0] ? 522 : 403)())
    expect(await cycle.run(start)).toMatchObject({ satcat: 'waiting' })
    expect(asked().map(([region]) => region)).toEqual(REGIONS.slice(0, 2))
    expect(state.get('wait')).toMatchObject({ kind: 'refused', region: REGIONS[1], status: 403 })
  })

  it('waits once no region reaches CelesTrak, naming the result of each region', async () => {
    const missOf  = (region: cycles.Region) => MISSES[REGIONS.indexOf(region) % MISSES.length]
    const results = REGIONS.map(region => [region, expect.stringContaining(missOf(region)[2])])
    const { cycle, state, fetcher } = cycleOf(region => missOf(region)[1]())
    expect(await cycle.run(start)).toMatchObject({ satcat: 'waiting' })
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
    expect(await outcome).toMatchObject({ satcat: 'waiting' })
    expect(fetcher).toHaveBeenCalledOnce()
    expect([state.get('aborted'), state.get('downloaded')]).toEqual([start, undefined])
    expect(state.get('wait')).toMatchObject({
      kind   : 'unanswered',
      reason : `No answer within ${celestrak.HEADER_WAIT} ms`,
      region : REGIONS[0]
    })
  })

  it('doubles the wait on each refusal since the last request that succeeded, up to a day', async () => {
    const { cycle, fetcher, waited } = cycleOf(refused(403))
    const waits: number[] = []
    for (let time = start; waits.length < BACKOFF.length; time += waits.at(-1)!) {
      expect(await cycle.run(time)).toMatchObject({ satcat: 'waiting' })
      waits.push(Date.parse(waited().until) - time)
    }
    expect(waits).toEqual(BACKOFF)
    expect(waited().refusals).toBe(BACKOFF.length)
    expect(fetcher).toHaveBeenCalledTimes(BACKOFF.length)
  })

  it.each(ASKED)('waits %s where retry-after reads %s on a first refusal', async (_, asked, wait) => {
    const headers           = { 'retry-after': asked }
    const { cycle, waited } = cycleOf(() => new Response(null, { status: 429, headers }))
    await cycle.run(start)
    expect(Date.parse(waited().until) - start).toBe(wait)
  })

  it('logs the stored wait again under an event of its own on each run it blocks, asking CelesTrak once',
    async () => {
      const { cycle, state, fetcher } = cycleOf(refused(403), { env: {} })
      const failed = expect.objectContaining({ event: 'catalog.failed' })
      await cycle.run(start)
      const wait = state.get('wait')
      expect(await cycle.run(start + EVERY - MINUTE)).toMatchObject({ satcat: 'waiting' })
      fetcher.mockClear()
      state.set('wait', { ...wait as cycles.Wait, until: new Date(start + 3 * EVERY).toISOString() })
      expect(await cycle.run(start + 2 * EVERY - MINUTE)).toMatchObject({ satcat: 'waiting' })
      expect(fetcher).not.toHaveBeenCalled()
      expect(logged()).toEqual([wait, failed, expect.anything(), failed,
                                { event: 'catalog.blocked', wait: state.get('wait') }, failed])
    })

  it('ends the wait on its own once it runs out, logging the wait a request ends and starting over on '
   + 'the refusal after it', async () => {
    let answer: Answer = refused(403)
    const { cycle, state } = cycleOf((...args) => answer(...args))
    await cycle.run(start)
    const wait = state.get('wait')
    answer = good
    expect(await cycle.run(start + EVERY)).toMatchObject({ satcat: 'downloaded' })
    expect(state.get('wait')).toBeUndefined()
    expect(console.log).toHaveBeenCalledWith({ event: 'catalog.recovered', wait })
    answer = refused(403)
    expect(await cycle.run(start + 2 * EVERY)).toMatchObject({ satcat: 'waiting' })
    expect(state.get('wait')).toMatchObject({ refusals: 1, until: new Date(start + 3 * EVERY).toISOString() })
  })

  it('counts the refusals through a fault of another kind, which waits for the next run alone',
    async () => {
      let answer: Answer = refused(403)
      const { cycle, state, waited } = cycleOf((...args) => answer(...args))
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

  it('waits until an hour past its own download after a 403 for data that has not updated, keeping '
   + 'the refusal count where it stood', async () => {
    const own  = start - EVERY + 30_000
    let answer: Answer = unchanged(own)
    const { cycle, state, fetcher, waited } = cycleOf((...args) => answer(...args))
    state.set('downloaded', start - EVERY)
    expect(await cycle.run(start)).toMatchObject({ satcat: 'waiting' })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(logged()[0]).toEqual(waited())
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

  it.each([
    ['a minute after', 1, MINUTE],
    ['a minute and a second after', REGIONS.length, MINUTE + 1000],
    ['a minute before', 1, -MINUTE],
    ['a minute and a second before', 1, -MINUTE - 1000],
    ['half an hour before', 1, -30 * MINUTE]
  ])('reads a 403 naming a download %s the one the cycle made as another client\'s only past a '
   + 'minute after it, asking %i regions', async (_, count, offset) => {
    let answer: Answer = good
    const { cycle, fetcher } = cycleOf((...args) => answer(...args))
    await cycle.run(start)
    fetcher.mockClear()
    answer = unchanged(start + offset)
    expect(await cycle.run(start + EVERY)).toMatchObject({ satcat: 'waiting' })
    expect(fetcher).toHaveBeenCalledTimes(count)
  })

  it.each([
    ['a SATCAT file', good],
    ['a SATCAT file that fails its check', servedOf(LISTED, 'OBJECT_NAME\r\n')]
  ])('reads a 403 naming the time a late run sent the request answered with %s as its own download',
    async (_, first) => {
      const late = 24 * MINUTE
      let answer = first
      const { asked, cycle, state, fetcher } = cycleOf((...args) => answer(...args))
      await cycle.run(start, late)
      expect(state.get('downloaded')).toBe(start + late)
      fetcher.mockClear()
      answer = unchanged(start + late)
      expect(await cycle.run(start + EVERY)).toMatchObject({ satcat: 'waiting' })
      expect(asked()).toEqual([[REGIONS[0], DIRECTORY]])
    })

  it('dates a download after regions that failed to connect by the time its own request was sent',
    async () => {
      const CONNECT = 19_000
      const { cycle, state } = cycleOf((region, source) => {
        if (region === REGIONS.at(-1)) return good(region, source)
        vi.setSystemTime(Date.now() + CONNECT)
        return refused(522)()
      })
      expect(await cycle.run(start)).toMatchObject({ satcat: 'downloaded' })
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
    let answer: Answer = (region, source, init) =>
      region === REGIONS[0] ? other() : stall(region, source, init)
    const { asked, cycle, state, fetcher } = cycleOf((...args) => answer(...args))
    state.set('downloaded', start - EVERY)
    const outcome = cycle.run(start)
    await vi.advanceTimersByTimeAsync(celestrak.HEADER_WAIT)
    expect(await outcome).toMatchObject({ satcat: 'waiting' })
    expect(asked().map(([region]) => region)).toEqual(REGIONS.slice(0, 2))
    answer = (region, source) => region === REGIONS[0] ? other() : good(region, source)
    fetcher.mockClear()
    expect(await cycle.run(start + EVERY)).toMatchObject({ satcat: 'downloaded' })
    expect(asked().map(([region]) => region)).toEqual([REGIONS[0], REGIONS[1], REGIONS[1]])
  })

  it.each([
    ['a minute after', 1, MINUTE],
    ['a minute before', 1, -MINUTE],
    ['a minute and a second after', REGIONS.length, MINUTE + 1000],
    ['a minute and a second before', REGIONS.length, -MINUTE - 1000]
  ])('reads a 403 naming a download %s a request a late run sent that timed out as its own only within '
   + 'a minute of it', async (_, count, offset) => {
    vi.useFakeTimers()
    const late = 24 * MINUTE
    let answer: Answer = stall
    const { cycle, fetcher } = cycleOf((...args) => answer(...args))
    const outcome = cycle.run(start, late)
    await vi.advanceTimersByTimeAsync(celestrak.HEADER_WAIT)
    expect(await outcome).toMatchObject({ satcat: 'waiting' })
    answer = unchanged(start + late + offset)
    fetcher.mockClear()
    expect(await cycle.run(start + EVERY)).toMatchObject({ satcat: 'waiting' })
    expect(fetcher).toHaveBeenCalledTimes(count)
  })

  it('downloads from the next region after a 403 naming a download the cycle did not make, and starts '
   + 'from that region on the next run', async () => {
    let answer: Answer = (region, source) =>
      region === REGIONS[0] ? unchanged(start - EVERY / 4)() : good(region, source)
    const { asked, cycle, state, fetcher } = cycleOf((...args) => answer(...args))
    expect(await cycle.run(start)).toMatchObject({ satcat: 'downloaded' })
    expect(asked().map(([region]) => region)).toEqual([REGIONS[0], REGIONS[1], REGIONS[1]])
    expect([state.get('downloaded'), state.get('reached')]).toEqual([start, REGIONS[1]])
    expect(state.has('wait')).toBe(false)
    answer = good
    fetcher.mockClear()
    await cycle.run(start + EVERY)
    expect(asked()).toEqual([[REGIONS[1], DIRECTORY]])
  })

  it('asks each region once where each names a download the cycle did not make or fails to connect, '
   + 'waiting until an hour past the last download named', async () => {
    const other   = start - EVERY / 4
    const replies = [unchanged(other - 1000), refused(522), unchanged(other), unchanged(other), refused(523)]
    let answer: Answer = region => replies[REGIONS.indexOf(region)]()
    const { asked, cycle, waited } = cycleOf((...args) => answer(...args))
    expect(await cycle.run(start)).toMatchObject({ satcat: 'waiting' })
    expect(asked().map(([region]) => region)).toEqual(REGIONS)
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
    expect(await cycle.run(start + EVERY)).toMatchObject({ satcat: 'downloaded' })
  })

  it.each([
    ['a refusal', refused(403), 'refused'],
    ['a 403 naming no time', () => new Response(answers.unchangedBody(''), { status: 403 }), 'unchanged']
  ])('waits an hour on %s from the region after one naming a download the cycle did not make',
    async (_, next, kind) => {
      const other                      = unchanged(start)
      const { cycle, fetcher, waited } = cycleOf(region => region === REGIONS[0] ? other() : next())
      expect(await cycle.run(start + MINUTE)).toMatchObject({ satcat: 'waiting' })
      expect(fetcher).toHaveBeenCalledTimes(2)
      const until = new Date(start + MINUTE + EVERY).toISOString()
      expect(waited()).toMatchObject({ kind, region: REGIONS[1], until })
    })

  it.each([
    ['an hour after the download it names', start - EVERY / 2, start + EVERY / 2],
    ['an hour at most', start + EVERY, start + EVERY]
  ])('waits %s after a 403 for data that has not updated, whatever retry-after reads',
    async (_, own, until) => {
      const headers                  = { 'retry-after': String(LONGEST / 1000) }
      const { cycle, state, waited } = cycleOf(unchanged(own, headers))
      state.set('downloaded', own)
      await cycle.run(start)
      expect(waited()).toMatchObject({ kind: 'unchanged', until: new Date(until).toISOString() })
    })

  it.each([
    ['the last attempt', good, 'downloaded'],
    ['the end of a wait', refused(403), 'waiting']
  ])('runs on a scheduled run seconds short of an hour after %s', async (_, answer, first) => {
    let next: Answer = answer
    const { cycle, fetcher } = cycleOf((...args) => next(...args))
    expect(await cycle.run(start + 11_000)).toMatchObject({ satcat: first })
    next = servedOf(LISTED + 1000)
    expect(await cycle.run(start + EVERY)).toMatchObject({ satcat: 'downloaded' })
    expect(fetcher).toHaveBeenCalledTimes(first === 'downloaded' ? 4 : 3)
  })

  it.each(HALTS)('turns a halt stored as %s into a wait ending an hour after the halt, '
               + 'deleting the old keys', async (_, halt, at) => {
    const { cycle, state, fetcher } = cycleOf(good)
    state.set('alerted', true)
    state.set('attempted', start - 3 * EVERY)
    state.set('halted', halt)
    expect(await cycle.run(start)).toMatchObject({ satcat: 'waiting' })
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
    expect(logged()[0]).toEqual(wait)
    state.delete('attempted')
    expect(await cycle.run(at + EVERY - MINUTE - 1)).toMatchObject({ satcat: 'waiting' })
    state.delete('attempted')
    expect(await cycle.run(at + EVERY - MINUTE)).toMatchObject({ satcat: 'downloaded' })
  })

  it.each([
    ['more than an hour', EVERY + 1],
    ['seconds short of an hour', EVERY - 11_000]
  ])('downloads on the first run after a halt recorded %s before it', async (_, age) => {
    const { cycle, state } = cycleOf(good)
    state.set('attempted', start - 3 * EVERY)
    state.set('halted', { ...halted, time: new Date(start - age).toISOString() })
    expect(await cycle.run(start)).toMatchObject({ satcat: 'downloaded' })
    expect([state.has('halted'), state.has('wait')]).toEqual([false, false])
    expect(console.log).toHaveBeenCalledWith(expect.objectContaining({ event: 'catalog.recovered' }))
  })
})

describe('the schedule', () => {
  it('runs the cycle once an hour at the minute the cycle records', async () => {
    const { default: wrangler } = await import('../../../docs/.vitepress/catalog/wrangler.json', {
      with: { type: 'json' }
    })
    expect(wrangler.triggers.crons).toEqual([`${cycles.MINUTE} * * * *`])
  })

  it('sets the minute away from the top and the bottom of the hour', () => {
    expect([0, 30]).not.toContain(cycles.MINUTE)
  })
})
