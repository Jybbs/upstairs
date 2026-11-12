// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as catalog           from '../../lib/orbit/catalog.ts'
import * as scan              from '../../lib/orbit/scan.ts'
import type { Answer, Asked } from '../../lib/orbit/worker.ts'
import { fresh }              from '../fixtures/fresh.ts'

const NOW       = Date.parse('2026-11-06T18:37:00Z')
const OTHER     = { epoch: 0, id: 2, kind: 'crewed', name: 'CRAFT 2' } as const
const SATELLITE = { epoch: 0, id: 1, kind: 'crewed', name: 'CRAFT 1' } as const
const SAMPLES   = scan.samplesFor(60, scan.TRACK_STEP)

let listen: (event: MessageEvent<Answer>) => void
let posted: Asked[]

type Sky = Awaited<ReturnType<typeof loaded>>

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
 * Loads a fresh copy of the shared state over a stand-in worker on a page
 * addressed by `fragment`, on a device reducing motion where `reduced` is set,
 * with the catalog loaded and the first scan asked for.
 */
const loaded = async (fragment = '', reduced = false) => {
  history.replaceState(null, '', `/somewhere?at=1${fragment}`)
  posted = []
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
  vi.stubGlobal('Worker', class {
    set onmessage(listener: typeof listen) { listen = listener }
    postMessage(asked: Asked) { posted.push(asked) }
  })
  const { sky } = await fresh(() => import('../../lib/state/sky.ts'))
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
  const track   = new Float32Array(SAMPLES * scan.TRACK_WIDTH).map((_, index) => index % 3 === 2 ? 45 : 0)
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
    const now   = start + sky.span * 1000 + offset
    vi.setSystemTime(now)
    sky.tally()
    expect(sky.start.value).toBe(moved ? scan.minuteOf(now) - 300_000 : start)
    expect(posted.at(-1)).toMatchObject({ start: sky.start.value, type: 'scan' })
  })
})

describe('the clock times of a range', () => {
  it.each([
    ['writes the half of the day once within one day', [21, 5], [21, 20], '9:05 – 9:20 PM'],
    ['writes both clock times in full across midnight', [23, 52], [24, 2], '11:52 PM – 12:02 AM']
  ])('%s', async (_, [riseHour, riseMinute], [setHour, setMinute], range) => {
    const sky      = await loaded()
    const secondOf = (hour: number, minute: number) =>
      (new Date(sky.start.value).setHours(hour, minute, 0, 0) - sky.start.value) / 1000
    expect(sky.rangeOf(secondOf(riseHour, riseMinute), secondOf(setHour, setMinute))).toBe(range)
  })
})

describe('the spot in the address', () => {
  it.each([
    ['#-33.87,151.21', { latitude: -33.87, longitude: 151.21 }, null],
    ['#boston', { latitude: 42.36, longitude: -71.06 }, 'Boston'],
    ['', { latitude: 42.36, longitude: -71.06 }, 'Boston']
  ])('opens a page addressed %j on %o over %j', async (fragment, spot, place) => {
    const sky = await loaded(fragment)
    expect(sky.spot.value).toEqual(spot)
    expect(sky.place.value).toBe(place)
  })

  it('writes a chosen spot into the address rounded', async () => {
    const sky = await loaded()
    sky.pick({ latitude: 48.85837, longitude: 2.29448 }, 'Paris')
    expect(location.hash).toBe('#48.86,2.29')
  })

  it('clears the address of any spot once the browser locates the reader', async () => {
    const sky = await loaded('#48.86,2.29')
    sky.locate({ latitude: 51.50073, longitude: -0.12463 })
    expect(location.href).toBe(`${location.origin}/somewhere?at=1`)
    expect(sky.spot.value).toEqual({ latitude: 51.50073, longitude: -0.12463 })
    expect(sky.place.value).toBe('your location')
  })
})

describe('the spot chooser', () => {
  it('opens on the spot, its pin naming the place', async () => {
    const sky = await loaded()
    sky.choose()
    expect([sky.choosing.value, sky.aim.value])
      .toEqual(['open', { place: sky.place.value, spot: sky.spot.value }])
  })

  it.each([
    ['moves to the spot under the pin and lands there once set', 'land', 'landing',
      { latitude: 48.86, longitude: 2.29 }],
    ['shuts with the spot unchanged once left', 'shut', 'shut', null]
  ] as const)('%s', async (_, leave, choosing, moved) => {
    const sky   = await loaded()
    const spot  = sky.spot.value
    sky.choose()
    sky.aim.value = { place: 'Paris', spot: { latitude: 48.86, longitude: 2.29 } }
    sky[leave]()
    expect([sky.choosing.value, sky.spot.value]).toEqual([choosing, moved ?? spot])
  })

  it('moves nowhere from a chooser already shut', async () => {
    const sky  = await loaded()
    const pick = vi.spyOn(sky, 'pick')
    sky.land()
    expect([sky.choosing.value, pick.mock.calls.length]).toEqual(['shut', 0])
  })
})

describe('the pinned pass', () => {
  it.each([
    ['pins the next pass to peak where none is pinned', null, 1, 1],
    ['pins the pass peaking after the pinned one', 1, 1, 2],
    ['pins the pass peaking before the pinned one', 1, -1, 0],
    ['keeps the last pass pinned at the end of the list', 2, 1, 2],
    ['pins the pass peaking before the time read where none is pinned', null, -1, 0]
  ] as const)('%s', async (_, from, by, to) => {
    const sky    = await loaded()
    const passes = [passAt(0, 30), passAt(400, 40, OTHER), passAt(900, 50)]
    traced(passes)
    sky.scope.value = 'sky'
    sky.seek(500)
    expect(sky.rows.value.list).toHaveLength(3)
    if (from !== null) sky.pinned.value = sky.rows.value.list[from]
    sky.step(by)
    expect(sky.pinned.value).toBe(sky.rows.value.list[to])
  })

  it('shows the held pass over the pinned one, and neither once released', async () => {
    const sky        = await loaded()
    const passes     = [passAt(0, 30), passAt(400, 40, OTHER)]
    traced(passes)
    const [one, two] = sky.tracks.passes
    sky.pinned.value = one
    sky.held.value   = two
    const shown      = [sky.shown.value]
    sky.release()
    expect([...shown, sky.shown.value]).toEqual([two, null])
  })
})

describe('the clock', () => {
  it('opens live on the present, five minutes into a window starting on a whole minute', async () => {
    const sky = await loaded()
    expect(sky.clock.value).toBe('live')
    expect(sky.start.value).toBe(scan.minuteOf(NOW) - 300_000)
    expect(sky.seconds).toBe(300)
    vi.advanceTimersByTime(10_000)
    sky.advance(10)
    expect(sky.seconds).toBe(310)
  })

  it('runs the rest of the hour at 60 times real speed and holds at its end', async () => {
    const sky = await loaded()
    sky.turn()
    expect(sky.clock.value).toBe('running')
    sky.advance(1)
    expect(sky.seconds).toBe(360)
    sky.advance(3600)
    expect(sky.seconds).toBe(sky.span)
    expect(sky.clock.value).toBe('held')
  })

  it.each([
    ['the fast-forward', (sky: Sky) => sky.turn()],
    ['a moment the reader chose', (sky: Sky) => sky.seek(2000)]
  ])('returns from %s to the present on the next press', async (_, leave) => {
    const sky = await loaded()
    leave(sky)
    sky.advance(5)
    sky.turn()
    expect(sky.clock.value).toBe('live')
    expect(sky.seconds).toBe(300)
  })

  it('holds a moment the reader chose while the present moves on', async () => {
    const sky = await loaded()
    sky.seek(2000)
    vi.advanceTimersByTime(60_000)
    sky.advance(60)
    expect(sky.clock.value).toBe('held')
    expect(sky.seconds).toBe(2000)
  })

  it('holds a chosen moment in its window once the present passes the window’s end', async () => {
    const sky   = await loaded()
    const start = sky.start.value
    sky.seek(2000)
    vi.advanceTimersByTime(sky.span * 1000)
    sky.tally()
    expect([sky.start.value, sky.seconds]).toEqual([start, 2000])
  })

  it('opens a new window once the present passes the end of this one on the way back', async () => {
    const sky = await loaded()
    sky.seek(2000)
    vi.advanceTimersByTime(sky.span * 1000)
    sky.back()
    expect(sky.start.value).toBe(scan.minuteOf(Date.now()) - 300_000)
    expect(sky.clock.value).toBe('live')
  })
})

describe('the catalog age', () => {
  it.each([
    ['places satellites from a catalog fetched 14 days before the window opens', 14, false],
    ['places nothing from a catalog fetched more than 14 days before', 14.01, true]
  ])('%s', async (_, days, expired) => {
    const sky = await loaded()
    hear({ count: 1, fetched: sky.start.value - days * catalog.DAY, type: 'loaded' })
    expect(sky.expired.value).toBe(expired)
  })
})

describe('the clock under reduced motion', () => {
  it('holds the frame it opened on while the present moves on', async () => {
    const sky = await loaded('', true)
    expect(sky.clock.value).toBe('held')
    vi.advanceTimersByTime(120_000)
    sky.advance(120)
    sky.tally()
    expect(sky.seconds).toBe(300)
    expect(sky.away.value).toBe(-2)
  })

  it('moves the held frame five minutes on at each press, holding it at the window’s end', async () => {
    const sky = await loaded('', true)
    sky.turn()
    expect(sky.seconds).toBe(600)
    expect(sky.away.value).toBe(5)
    for (let press = 0; press < 12; press++) sky.turn()
    expect(sky.seconds).toBe(sky.span)
    expect(sky.clock.value).toBe('held')
  })

  it('draws the sky as it is now on the way back, and holds it', async () => {
    const sky = await loaded('', true)
    vi.advanceTimersByTime(180_000)
    sky.back()
    expect(sky.seconds).toBe(480)
    expect(sky.away.value).toBe(0)
    expect(sky.clock.value).toBe('held')
  })
})

describe('the reading', () => {
  const ON_MAP = Uint16Array.of(2, 0, 1, 0, 0, 0, 3, 0)

  it('takes a reading on every call while the passes are traced', async () => {
    const sky = await loaded()
    sky.latch(ON_MAP)
    expect(sky.reading.value.onMap).toBe(6)
    sky.latch(Uint16Array.of(1, 0, 0, 0, 0, 0, 0, 0))
    expect(sky.reading.value).toMatchObject({ kinds: [1, 0, 0, 0, 0, 0, 0, 0], onMap: 1 })
  })

  it('holds a reading for 30 seconds once the passes are traced', async () => {
    const sky = await loaded()
    traced([passAt(0, 30)])
    sky.latch(ON_MAP)
    sky.latch(Uint16Array.of(9, 0, 0, 0, 0, 0, 0, 0))
    vi.advanceTimersByTime(29_999)
    sky.latch(Uint16Array.of(9, 0, 0, 0, 0, 0, 0, 0))
    expect(sky.reading.value.onMap).toBe(6)
    vi.advanceTimersByTime(1)
    sky.latch(Uint16Array.of(9, 0, 0, 0, 0, 0, 0, 0))
    expect(sky.reading.value.onMap).toBe(9)
  })

  it('takes a reading at once after the clock moves', async () => {
    const sky = await loaded()
    traced([passAt(0, 30)])
    sky.latch(ON_MAP)
    sky.seek(100)
    sky.latch(Uint16Array.of(9, 0, 0, 0, 0, 0, 0, 0))
    expect(sky.reading.value.onMap).toBe(9)
  })

  it('takes a reading at once as the traces finish', async () => {
    const sky = await loaded()
    sky.latch(ON_MAP)
    traced([passAt(0, 30)])
    sky.latch(Uint16Array.of(9, 0, 0, 0, 0, 0, 0, 0))
    expect(sky.reading.value.onMap).toBe(9)
  })

  it('follows the map on every call while the fast-forward runs, and holds again once it stops', async () => {
    const sky     = await loaded()
    const onMapOf = (count: number) => Uint16Array.of(count, 0, 0, 0, 0, 0, 0, 0)
    traced([passAt(0, 30)])
    sky.latch(ON_MAP)
    sky.turn()
    sky.latch(onMapOf(9))
    expect(sky.reading.value.onMap).toBe(9)
    sky.advance(1)
    sky.latch(onMapOf(4))
    expect(sky.reading.value.onMap).toBe(4)
    sky.advance(3600)
    sky.latch(onMapOf(7))
    sky.latch(onMapOf(8))
    expect(sky.reading.value.onMap).toBe(7)
  })

  it('counts what stands above the horizon by kind', async () => {
    const sky = await loaded()
    traced([passAt(0, 30), passAt(200, 30, { ...OTHER, kind: 'weather' }), passAt(2000, 30, OTHER)])
    sky.seek(500)
    sky.latch(ON_MAP)
    expect(sky.reading.value).toMatchObject({ above: 2, aboveKinds: [1, 0, 0, 1, 0, 0, 0, 0] })
  })
})
