import { readFile } from 'node:fs/promises'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { encode }             from '../../catalog/encode.ts'
import type { Record }        from '../../lib/orbit/catalog.ts'
import { kindOf }             from '../../lib/orbit/kinds.ts'
import type { Answer, Asked } from '../../lib/orbit/worker.ts'
import answers                from '../fixtures/answers.json' with { type: 'json' }
import full                   from '../fixtures/records.json' with { type: 'json' }

const FETCHED = Date.parse('2026-11-06T18:53:57.264Z')
const START   = Date.parse(answers.start)
const file    = encode(FETCHED, full as unknown as Record[])

const built = vi.hoisted(() => ({ grids: 0 }))

vi.mock('../../../../rust/pkg/orbit.js', async importOriginal => {
  const crate = await importOriginal<typeof import('../../../../rust/pkg/orbit.js')>()
  const wasm  = new URL('../../../../rust/pkg/orbit_bg.wasm', import.meta.url)
  return {
    ...crate,
    default : async () => crate.default({ module_or_path: await readFile(wasm) }),
    Grid    : class extends crate.Grid {
      constructor(...made: ConstructorParameters<typeof crate.Grid>) {
        super(...made)
        built.grids++
      }
    }
  }
})

let heard: Answer[]
let hear: (asked: Asked) => Promise<void>

/**
 * Loads a fresh copy of the worker over a page whose catalog request `answer`
 * replies to, with every answer it posts collected in `heard`.
 */
const loaded = async (answer = () => new Response(file)) => {
  heard        = []
  built.grids  = 0
  const scope  = { onmessage: null as unknown, postMessage: (posted: Answer) => heard.push(posted) }
  vi.stubGlobal('self', scope)
  vi.stubGlobal('fetch', vi.fn(async () => answer()))
  vi.resetModules()
  await import('../../lib/orbit/worker.ts')
  hear = data => (scope.onmessage as (event: { data: Asked }) => Promise<void>)({ data })
  await hear({ type: 'load', url: '/catalog.bin' })
}

/**
 * Returns the message asking for scan `id` of the hour from `start` over
 * `spot`, each the known answers' own where none is given.
 */
const scanOf = (id: number, spot = answers.spot, start = START): Asked =>
  ({ id, minutes: answers.grid.minutes, spot, start, type: 'scan' })

/**
 * Returns the type of each answer to scan `id`, in the order it was posted.
 */
const typesOf = (id: number) =>
  heard.filter(answer => 'id' in answer && answer.id === id).map(({ type }) => type)

beforeEach(() => loaded())
afterEach(() => vi.unstubAllGlobals())

describe('loading the catalog', () => {
  it('counts the satellites loaded so far as each segment arrives, with the time the catalog was fetched', () => {
    const first = full.filter(record => kindOf(record.OBJECT_NAME) !== 'starlink').length
    expect(heard).toEqual([first, full.length].map(count => ({ count, fetched: FETCHED, type: 'loaded' })))
  })

  it('reports why where the catalog cannot be read', async () => {
    await loaded(() => new Response(null, { status: 503 }))
    expect(heard).toEqual([{ reason: 'Error: The catalog answered 503', type: 'failed' }])
  })

  it('answers no scan asked for before a catalog has loaded', async () => {
    await loaded(() => new Response(null, { status: 503 }))
    await hear(scanOf(1))
    expect(typesOf(1)).toEqual([])
  })
})

describe('a scan', () => {
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

  it.each([
    ['while it builds the grid, before it posts anything', false, []],
    ['over a grid it holds, before it finishes', true, ['counts', 'passes']]
  ])('stops for a newer scan arriving %s', async (_, held, older) => {
    if (held) await hear(scanOf(1))
    await Promise.all([hear(scanOf(2)), hear(scanOf(3))])
    expect([typesOf(2), typesOf(3).at(-1)]).toEqual([older, 'done'])
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
