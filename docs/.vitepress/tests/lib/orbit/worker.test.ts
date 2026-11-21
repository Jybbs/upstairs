import { readFile } from 'node:fs/promises'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { encode }                    from '../../../catalog/encode.ts'
import type { Record }               from '../../../lib/orbit/catalog.ts'
import { kindOf }                    from '../../../lib/orbit/kinds.ts'
import type { Answer, Asked, Share } from '../../../lib/orbit/worker.ts'
import answers                       from '../../fixtures/answers.json' with { type: 'json' }
import full                          from '../../fixtures/records.json' with { type: 'json' }

const FETCHED     = Date.parse('2026-11-06T18:53:57.264Z')
const LOAD: Asked = { helpers: [], type: 'load', url: '/catalog.bin' }
const START       = Date.parse(answers.start)
const file        = encode(FETCHED, full as unknown as Record[])
/**
 * The committed records copied under new catalog numbers until more of them
 * rise over the spot than the 100 the worker traces in one batch.
 */
const batches = encode(FETCHED, Array.from(
  { length: Math.ceil(101 / answers.grid.risen.length) },
  (_, copy) => full.map(record => ({ ...record, NORAD_CAT_ID: record.NORAD_CAT_ID + copy * 100_000 }))
).flat() as unknown as Record[])

const built = vi.hoisted(() => ({ grids: 0, ready: Promise.resolve() as Promise<unknown>, throws: false }))

vi.mock('../../../../../rust/pkg/orbit.js', async importOriginal => {
  const crate = await importOriginal<typeof import('../../../../../rust/pkg/orbit.js')>()
  const wasm  = new URL('../../../../../rust/pkg/orbit_bg.wasm', import.meta.url)
  return {
    ...crate,
    default : async () => {
      await built.ready
      return crate.default({ module_or_path: await readFile(wasm) })
    },
    Grid    : class extends crate.Grid {
      constructor(...made: ConstructorParameters<typeof crate.Grid>) {
        super(...made)
        built.grids++
      }
    },
    Tracer  : class extends crate.Tracer {
      override trace(...traced: Parameters<typeof crate.Tracer.prototype.trace>) {
        if (built.throws) throw new Error('unreachable')
        return super.trace(...traced)
      }
    }
  }
})

let heard: Answer[]
let hear: (asked: Asked) => Promise<void>
let heed: (answer: Answer) => void
let scope: { onmessage: unknown, postMessage: (posted: Answer) => void }

/**
 * Queues `run` as the worker's next task, after every task queued before it,
 * running once the microtasks of the task before it have settled.
 */
const task = (run: () => void) => setImmediate(run)

/**
 * Stands in for the worker's `MessageChannel`, delivering each message to
 * `port1` as a task queued through `task`.
 */
class Channel {
  port1 = { onmessage: null as (() => void) | null }
  port2 = { postMessage: () => task(() => this.port1.onmessage?.()) }
}

/**
 * Loads a fresh copy of the worker over a page whose catalog request `answer`
 * replies to, with every answer it posts collected in `heard` and then passed
 * to `heed`, and every yield it takes queued through `task`.
 */
const loaded = async (answer = () => new Response(file), helpers: MessagePort[] = []) => {
  heard        = []
  heed         = () => {}
  built.grids  = 0
  built.ready  = Promise.resolve()
  built.throws = false
  scope        = {
    onmessage   : null,
    postMessage : (posted: Answer) => {
      heard.push(posted)
      heed(posted)
    }
  }
  vi.stubGlobal('self', scope)
  vi.stubGlobal('fetch', vi.fn(async () => answer()))
  vi.stubGlobal('MessageChannel', Channel)
  hear = await started()
  await hear({ ...LOAD, helpers })
}

/**
 * Loads another fresh copy of the worker into the scope `loaded` set up,
 * returning its handler.
 */
const started = async () => {
  vi.resetModules()
  await import('../../../lib/orbit/worker.ts')
  const handler = scope.onmessage as (event: { data: Asked }) => Promise<void>
  return (data: Asked) => handler({ data })
}

/**
 * Returns the message asking for scan `id` of the hour from `start` over
 * `spot`, each the known answers' own where none is given.
 */
const scanOf = (id: number, spot = answers.spot, start = START): Extract<Asked, { type: 'scan' }> =>
  ({ id, minutes: answers.grid.minutes, spot, start, type: 'scan' })

/**
 * Returns every answer of type `type` the worker has posted.
 */
const answersOf = <T extends Answer['type']>(type: T) =>
  heard.filter((answer): answer is Extract<Answer, { type: T }> => answer.type === type)

/**
 * Returns the type of each answer to scan `id`, in the order it was posted.
 */
const typesOf = (id: number) =>
  heard.filter(answer => 'id' in answer && answer.id === id).map(({ type }) => type)

afterEach(() => vi.unstubAllGlobals())

describe('loading the catalog', () => {
  it('counts the satellites loaded so far as each segment arrives, '
   + 'beside the catalog’s fetch time', async () => {
    await loaded()
    const first = full.filter(record => kindOf(record.OBJECT_NAME) !== 'starlink').length
    expect(heard.map(answer => answer.type === 'loaded' && [answer.count, answer.fetched]))
      .toEqual([[first, FETCHED], [full.length, FETCHED]])
  })

  it('posts each satellite of the catalog once across its segments', async () => {
    await loaded()
    const posted = answersOf('loaded').flatMap(({ satellites }) => satellites)
    expect(posted.map(({ id, name }) => [id, name]).sort())
      .toEqual(full.map(record => [record.NORAD_CAT_ID, record.OBJECT_NAME]).sort())
  })

  it('reports why where the catalog cannot be read', async () => {
    await loaded(() => new Response(null, { status: 503 }))
    expect(heard).toEqual([{ reason: 'Error: The catalog answered 503', type: 'failed' }])
  })

  it('counts each satellite once on a second load, after dropping the catalog it held', async () => {
    await loaded()
    const first = heard.length
    await hear(LOAD)
    expect(heard.slice(first)).toEqual(heard.slice(0, first))
  })

  it('answers no scan asked for before a catalog has loaded', async () => {
    await loaded(() => new Response(null, { status: 503 }))
    await hear(scanOf(1))
    expect(typesOf(1)).toEqual([])
  })
})

describe('a scan', () => {
  beforeEach(() => loaded())

  it('counts the sky over the spot as the known answers do, then traces each pass and finishes', async () => {
    await hear(scanOf(1))
    const [counts] = answersOf('counts')
    expect(Array.from(counts.counts)).toEqual(answers.grid.counts)
    const types = typesOf(1)
    expect(types).toEqual(['counts', ...types.slice(1, -1).map(() => 'passes'), 'done'])
  })

  it('traces every satellite but Starlink before any Starlink', async () => {
    await hear(scanOf(1))
    const starlink = answersOf('passes').flatMap(answer => answer.passes)
      .map(pass => pass.kind === 'starlink')
    expect(starlink).toEqual(starlink.toSorted((a, b) => Number(a) - Number(b)))
    expect(new Set(starlink)).toEqual(new Set([false, true]))
  })

  it('stops a scan under way once a new load arrives, posting neither its end nor a failure', async () => {
    await Promise.all([hear(scanOf(1)), hear(LOAD)])
    expect(typesOf(1)).toEqual([])
  })

  it.each([
    ['while it builds the grid, before it posts anything', false, []],
    ['over a grid it holds, before it finishes', true, ['counts', 'passes']]
  ])('stops for a newer scan arriving %s', async (_, held, older) => {
    if (held) await hear(scanOf(1))
    await Promise.all([hear(scanOf(2)), hear(scanOf(3))])
    expect([typesOf(2), typesOf(3).at(-1)]).toEqual([older, 'done'])
  })

  it('builds a new grid for the same window once a new load drops the catalog', async () => {
    await hear(scanOf(1))
    await hear(LOAD)
    await hear(scanOf(2))
    expect([built.grids, typesOf(2).at(-1)]).toEqual([2, 'done'])
  })

  it.each([
    ['keeps the grid for another spot in the same window', { latitude: -33.87, longitude: 151.21 }, START, 1],
    ['builds a new grid for a window opening at another time', answers.spot, START + 60_000, 2]
  ])('%s', async (_, spot, start, grids) => {
    await hear(scanOf(1))
    await hear(scanOf(2, spot, start))
    expect([built.grids, typesOf(2).at(-1)]).toEqual([grids, 'done'])
  })
})

describe('a scan that throws', () => {
  beforeEach(() => loaded())

  it('answers that the passes could not be traced, and the next scan reuses its grid', async () => {
    built.throws = true
    await hear(scanOf(1))
    built.throws = false
    await hear(scanOf(2))
    expect([typesOf(1), typesOf(2).at(-1), built.grids]).toEqual([['counts', 'untraced'], 'done', 1])
  })
})

describe('a scan of more than one batch', () => {
  it('stops after the batch under way once a newer scan arrives', async () => {
    await loaded(() => new Response(batches))
    let newer = Promise.resolve()
    heed      = answer => {
      if (answer.type !== 'passes') return
      heed = () => {}
      task(() => { newer = hear({ ...scanOf(2), minutes: 1 }) })
    }
    await hear(scanOf(1))
    await newer
    const [first] = answersOf('passes')
    expect([typesOf(1), first.done < first.total, typesOf(2).at(-1)])
      .toEqual([['counts', 'passes'], true, 'done'])
  })
})

describe('a catalog shared with a helper', () => {
  /**
   * Returns a stand-in port holding the listener a helper sets on it.
   */
  const portOf = () =>
    ({ close: vi.fn(), onmessage: null as ((event: { data: Share }) => Promise<void>) | null })

  /**
   * Loads the catalog into a lead handing a helper its share over a stand-in
   * port, returning the lead's handler and each share the port carried.
   */
  const shared = async () => {
    const shares: Share[] = []
    await loaded(undefined, [{ postMessage: (share: Share) => shares.push(share) } as unknown as MessagePort])
    return { lead: hear, shares }
  }

  it('hands the helper every other row of the catalog and posts every satellite from the lead', async () => {
    const { shares } = await shared()
    const posted     = answersOf('loaded').flatMap(({ satellites }) => satellites)
    expect([
      shares.flatMap(share => share.records.map(record => record.NORAD_CAT_ID)),
      shares.map(({ count, fetched }) => [count, fetched])
    ]).toEqual([
      posted.filter((_, row) => row % 2 === 1).map(({ id }) => id),
      answersOf('loaded').map(({ count, fetched }) => [count, fetched])
    ])
  })

  it('counts the sky as the known answers do and traces every pass once, '
   + 'between the lead and the helper', async () => {
    await loaded()
    await hear(scanOf(1))
    const alone            = answersOf('passes').flatMap(answer => answer.passes)
    const { lead, shares } = await shared()
    const port             = portOf()
    const helper           = await started()
    await helper({ from: port as unknown as MessagePort, type: 'follow' })
    for (const data of shares) await port.onmessage!({ data })
    heard = []
    await lead(scanOf(1))
    await helper(scanOf(1))
    const counts = answersOf('counts').map(answer => Array.from(answer.counts))
    const passes = answersOf('passes').flatMap(answer => answer.passes)
    expect([
      counts[0].map((count, index) => count + counts[1][index]),
      passes.map(pass => pass.key).sort(),
      typesOf(1).filter(type => type === 'done')
    ]).toEqual([answers.grid.counts, alone.map(pass => pass.key).sort(), ['done', 'done']])
  })

  it('posts the count of every row loaded once it holds each share, '
   + 'and nothing after following another port', async () => {
    const { shares } = await shared()
    const port       = portOf()
    const helper     = await started()
    heard            = []
    await helper({ from: port as unknown as MessagePort, type: 'follow' })
    await port.onmessage!({ data: shares[0] })
    const first      = port.onmessage!
    await helper({ from: { close() {} } as unknown as MessagePort, type: 'follow' })
    await first({ data: shares[1] })
    expect([heard, port.close.mock.calls.length])
      .toEqual([[{ count: shares[0].count, fetched: FETCHED, satellites: [], type: 'loaded' }], 1])
  })

  it('holds a share that arrives before its module is ready until the module is ready', async () => {
    const { shares } = await shared()
    let open         = () => {}
    built.ready      = new Promise<void>(resolve => { open = resolve })
    const port       = portOf()
    const helper     = await started()
    heard            = []
    await helper({ from: port as unknown as MessagePort, type: 'follow' })
    const held       = port.onmessage!({ data: shares[0] })
    await new Promise(resolve => task(() => resolve(null)))
    const early      = heard.length
    open()
    await held
    expect([early, heard])
      .toEqual([0, [{ count: shares[0].count, fetched: FETCHED, satellites: [], type: 'loaded' }]])
  })
})
