// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as scan              from '../../lib/orbit/scan.ts'
import type { Answer, Asked } from '../../lib/orbit/worker.ts'

const NOW       = Date.parse('2026-11-06T18:37:00Z')
const OTHER     = { epoch: 0, id: 2, kind: 'crewed', name: 'CRAFT 2' } as const
const SATELLITE = { epoch: 0, id: 1, kind: 'crewed', name: 'CRAFT 1' } as const
const SAMPLES   = scan.samplesFor(60, scan.TRACK_STEP)

let listen: (event: MessageEvent<Answer>) => void
let posted: Asked[]

const hear = (answer: Answer) => listen({ data: answer } as MessageEvent<Answer>)

const passAt = (riseAt: number, peak: number, satellite: scan.Satellite = SATELLITE) =>
  scan.passOf(satellite, {
    earlier : false,
    heading : 90,
    height  : 410,
    later   : false,
    peak    : peak,
    peakAt  : riseAt + 300,
    range   : 600,
    riseAt  : riseAt,
    riseAz  : 0,
    setAt   : riseAt + 600,
    setAz   : 180
  })

/**
 * Loads a fresh copy of the shared state over a stand-in worker, with the
 * catalog loaded and the first scan asked for.
 */
const loaded = async () => {
  posted = []
  vi.stubGlobal('Worker', class {
    set onmessage(listener: typeof listen) { listen = listener }
    postMessage(asked: Asked) { posted.push(asked) }
  })
  vi.resetModules()
  const { sky } = await import('../../lib/state/sky.ts')
  hear({ count: 1, fetched: NOW, type: 'loaded' })
  return sky
}

/**
 * Answers the latest scan with a set of passes sharing one track, then
 * finishes it.
 */
const traced = (passes: scan.Pass[]) => {
  const { id }  = posted.at(-1) as Extract<Asked, { type: 'scan' }>
  const offsets = new Uint32Array(passes.length)
  const total   = passes.length
  const track   = new Float32Array(SAMPLES * scan.TRACK_WIDTH)
  hear({ done: total, id, offsets, passes, samples: SAMPLES, total, track, type: 'passes' })
  hear({ id, type: 'done' })
}

beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the count a screen reader hears', () => {
  it('stays silent until the grid arrives', async () => {
    const sky = await loaded()
    sky.tally()
    expect(sky.spoken.value).toBe('')
  })

  it('announces the count once the grid arrives, and a changed count only after 20 seconds', async () => {
    const sky      = await loaded()
    const { id }   = posted.at(-1) as Extract<Asked, { type: 'scan' }>
    const countsOf = (count: number) => new Uint16Array(scan.samplesFor(60, scan.GRID_STEP)).fill(count)
    hear({ counts: countsOf(5), id, step: scan.GRID_STEP, type: 'counts' })
    expect(sky.spoken.value).toBe('5 satellites above the horizon')
    hear({ counts: countsOf(7), id, step: scan.GRID_STEP, type: 'counts' })
    expect(sky.spoken.value).toBe('5 satellites above the horizon')
    vi.advanceTimersByTime(19_999)
    sky.tally()
    expect(sky.spoken.value).toBe('5 satellites above the horizon')
    vi.advanceTimersByTime(1)
    sky.tally()
    expect(sky.spoken.value).toBe('7 satellites above the horizon')
  })
})

describe('the chosen pass', () => {
  it('stays on the same pass when a new scan finds it again', async () => {
    const sky = await loaded()
    traced([passAt(0, 30), passAt(1800, 50)])
    sky.focusOn(sky.tracks.passes[0])
    sky.scan()
    expect(sky.focus.value).toBeNull()
    traced([passAt(0, 30), passAt(1800, 50)])
    expect(sky.selected.value).toBe(sky.tracks.passes[0])
  })

  it('moves to the highest pass of the same satellite when its pass is gone', async () => {
    const sky = await loaded()
    traced([passAt(0, 30), passAt(1800, 50)])
    sky.focusOn(sky.tracks.passes[0])
    sky.scan()
    traced([passAt(600, 40), passAt(2400, 60), passAt(1200, 80, OTHER)])
    expect(sky.selected.value).toBe(sky.tracks.passes[1])
  })
})

describe('the window', () => {
  it.each([
    ['stays put while the present stands a millisecond short of its end', -1, false],
    ['moves to begin at the present once the present reaches its end', 0, true]
  ])('%s', async (_, offset, moved) => {
    const sky   = await loaded()
    const start = sky.start.value
    const now   = start + sky.span.value * 1000 + offset
    vi.setSystemTime(now)
    sky.tally()
    expect(sky.start.value).toBe(moved ? now : start)
    expect(posted.at(-1)).toMatchObject({ start: sky.start.value, type: 'scan' })
  })
})
