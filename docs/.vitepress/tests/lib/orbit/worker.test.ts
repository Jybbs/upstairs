import { readFile } from 'node:fs/promises'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { encode }             from '../../../catalog/encode.ts'
import type { Record }        from '../../../lib/orbit/catalog.ts'
import { kindOf }             from '../../../lib/orbit/kinds.ts'
import type { Answer, Asked } from '../../../lib/orbit/worker.ts'
import answers                from '../../fixtures/answers.json' with { type: 'json' }
import full                   from '../../fixtures/records.json' with { type: 'json' }

const FETCHED = Date.parse('2026-11-06T18:53:57.264Z')
const START   = Date.parse(answers.start)
const file    = encode(FETCHED, full as unknown as Record[])
/**
 * The committed records copied under new catalog numbers until more of them
 * rise over the spot than the 100 the worker traces in one batch.
 */
const batches = encode(FETCHED, Array.from(
  { length: Math.ceil(101 / answers.grid.risen.length) },
  (_, copy) => full.map(record => ({ ...record, NORAD_CAT_ID: record.NORAD_CAT_ID + copy * 100_000 }))
).flat() as unknown as Record[])

const built = vi.hoisted(() => ({ grids: 0, throws: false }))

vi.mock('../../../../../rust/pkg/orbit.js', async importOriginal => {
  const crate = await importOriginal<typeof import('../../../../../rust/pkg/orbit.js')>()
  const wasm  = new URL('../../../../../rust/pkg/orbit_bg.wasm', import.meta.url)
  return {
    ...crate,
    default : async () => crate.default({ module_or_path: await readFile(wasm) }),
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
const loaded = async (answer = () => new Response(file)) => {
  heard       = []
  heed         = () => {}
  built.grids  = 0
  built.throws = false
  const scope = {
    onmessage   : null as unknown,
    postMessage : (posted: Answer) => {
      heard.push(posted)
      heed(posted)
    }
  }
  vi.stubGlobal('self', scope)
  vi.stubGlobal('fetch', vi.fn(async () => answer()))
  vi.stubGlobal('MessageChannel', Channel)
  vi.resetModules()
  await import('../../../lib/orbit/worker.ts')
  hear = data => (scope.onmessage as (event: { data: Asked }) => Promise<void>)({ data })
  await hear({ type: 'load', url: '/catalog.bin' })
}

/**
 * Returns the message asking for scan `id` of the hour from `start` over
 * `spot`, each the known answers' own where none is given.
 */
const scanOf = (id: number, spot = answers.spot, start = START): Extract<Asked, { type: 'scan' }> =>
  ({ id, minutes: answers.grid.minutes, spot, start, type: 'scan' })

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
    expect(heard).toEqual([first, full.length].map(count => ({ count, fetched: FETCHED, type: 'loaded' })))
  })

  it('reports why where the catalog cannot be read', async () => {
    await loaded(() => new Response(null, { status: 503 }))
    expect(heard).toEqual([{ reason: 'Error: The catalog answered 503', type: 'failed' }])
  })

  it('counts each satellite once on a second load, after dropping the catalog it held', async () => {
    await loaded()
    const first = heard.length
    await hear({ type: 'load', url: '/catalog.bin' })
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
    const [counts] = heard.filter(answer => answer.type === 'counts')
    expect(Array.from(counts.counts)).toEqual(answers.grid.counts)
    const types = typesOf(1)
    expect(types).toEqual(['counts', ...types.slice(1, -1).map(() => 'passes'), 'done'])
  })

  it('traces every satellite but Starlink before any Starlink', async () => {
    await hear(scanOf(1))
    const starlink = heard.flatMap(answer => answer.type === 'passes' ? answer.passes : [])
      .map(pass => pass.kind === 'starlink')
    expect(starlink).toEqual(starlink.toSorted((a, b) => Number(a) - Number(b)))
    expect(new Set(starlink)).toEqual(new Set([false, true]))
  })

  it('stops a scan under way once a new load arrives, posting neither its end nor a failure', async () => {
    await Promise.all([hear(scanOf(1)), hear({ type: 'load', url: '/catalog.bin' })])
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
    await hear({ type: 'load', url: '/catalog.bin' })
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
    const [first] = heard.filter(answer => answer.type === 'passes')
    expect([typesOf(1), first.done < first.total, typesOf(2).at(-1)])
      .toEqual([['counts', 'passes'], true, 'done'])
  })
})
