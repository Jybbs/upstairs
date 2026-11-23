// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as catalog           from '../../../../docs/.vitepress/lib/orbit/catalog.ts'
import * as scan              from '../../../../docs/.vitepress/lib/orbit/scan.ts'
import type { Answer, Asked } from '../../../../docs/.vitepress/lib/orbit/worker.ts'
import { stubMatchMedia }     from '../../common/stubs.ts'

const NOW       = Date.parse('2026-11-06T18:37:00Z')
const OTHER     = { epoch: 0, id: 2, kind: 'crewed', name: 'CRAFT 2' } as const
const SATELLITE = { epoch: 0, id: 1, kind: 'crewed', name: 'CRAFT 1' } as const
const SAMPLES   = scan.samplesFor(60, scan.TRACK_STEP)
const SPOT      = { latitude: 1, longitude: 2 }

/**
 * A stand-in worker, holding the listeners the shared state gives it.
 */
interface Stand {
  fail       : () => void
  listen     : (event: MessageEvent<Answer>) => void
  terminated : boolean
}

let posted: Asked[]
let workers: Stand[]

type Sky = Awaited<ReturnType<typeof loaded>>

/**
 * Returns counts of `count` satellites up at every step of the scan's grid.
 */
const countsOf = (count: number) => new Uint16Array(scan.samplesFor(60, scan.GRID_STEP)).fill(count)

/**
 * Fails the first worker started as it starts.
 */
const fail = () => workers[0].fail()

/**
 * Answers `answer` from the first running worker, and from every other running
 * worker the answer `quietOf` gives for a helper with no satellite that rises.
 */
const hear = (answer: Answer) => workers.filter(({ terminated }) => !terminated).forEach((worker, index) => {
  const echoed = index ? quietOf(answer) : answer
  if (echoed) hearFrom(worker, echoed)
})

const hearFrom = (worker: Stand, answer: Answer) => worker.listen({ data: answer } as MessageEvent<Answer>)

/**
 * Returns what a helper holding no satellite that rises answers beside the
 * lead's `answer`, meaning the segment without its satellites, counts of zero,
 * and the end of the scan, and nothing beside passes, a failure, or a scan
 * that threw.
 */
const quietOf = (answer: Answer): Answer | null => {
  if (answer.type === 'loaded') return { ...answer, satellites: [] }
  if (answer.type === 'counts') return { ...answer, counts: new Uint16Array(answer.counts.length) }
  return answer.type === 'done' ? answer : null
}

/**
 * Returns the id of the latest scan asked for.
 */
const scanned = () => (posted.at(-1) as Extract<Asked, { type: 'scan' }>).id

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
 * with the catalog asked for, each worker started kept in `workers`.
 */
const opened = async (fragment = '', reduced = false) => {
  history.replaceState(null, '', `/somewhere?at=1${fragment}`)
  posted  = []
  workers = []
  stubMatchMedia(() => reduced)
  vi.stubGlobal('Worker', class implements Stand {
    fail: Stand['fail']     = () => {}
    listen: Stand['listen'] = () => {}
    terminated              = false
    constructor() { workers.push(this) }
    set onerror(listener: () => void) { this.fail = listener }
    set onmessage(listener: (event: MessageEvent<Answer>) => void) { this.listen = listener }
    postMessage(asked: Asked) { posted.push(asked) }
    terminate() { this.terminated = true }
  })
  vi.resetModules()
  const { sky } = await import('../../../../docs/.vitepress/lib/state/sky.ts')
  sky.loadOnce()
  return sky
}

/**
 * Loads a fresh copy of the shared state as `opened` does, with the catalog
 * loaded and the first scan asked for.
 */
const loaded = async (fragment = '', reduced = false) => {
  const sky = await opened(fragment, reduced)
  hear({ count: 1, fetched: NOW, satellites: [], type: 'loaded' })
  return sky
}

/**
 * Answers the latest scan with a set of passes sharing one track, then
 * finishes it.
 */
const traced = (passes: scan.Pass[]) => {
  const id      = scanned()
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
    const id       = scanned()
    hear({ counts: countsOf(5), id, step: scan.GRID_STEP, type: 'counts' })
    expect(sky.spoken.value).toBe('5 satellites above the horizon')
    sky.scan()
    hear({ counts: countsOf(7), id: scanned(), step: scan.GRID_STEP, type: 'counts' })
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

  it('opens on a station rather than the craft docked to it', async () => {
    const sky = await loaded()
    traced([passAt(600, 50), passAt(600, 50.5, OTHER)])
    expect(sky.selected.value).toBe(sky.tracks.passes[0])
  })

  it('opens on no pass of a kind not shown', async () => {
    const sky = await loaded()
    sky.trace(['earth'])
    traced([passAt(600, 50), passAt(1200, 70, OTHER)])
    expect(sky.selected.value).toBeNull()
  })

  it('chooses again among the kinds shown once the chosen pass\'s kind is switched off', async () => {
    const sky = await loaded()
    traced([passAt(600, 50), passAt(1200, 30, { ...OTHER, kind: 'weather' })])
    sky.pin(sky.tracks.passes[0])
    sky.trace(['weather'])
    expect([sky.selected.value, sky.shown.value, sky.focus.value])
      .toEqual([sky.tracks.passes[1], null, sky.tracks.passes[1]])
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

  it.each([
    ['#48.86,2.29?kinds=starlink,crewed', { latitude: 48.86, longitude: 2.29 }, ['crewed', 'starlink']],
    ['#?kinds=', { latitude: 42.36, longitude: -71.06 }, []],
    ['#48.86,2.29', { latitude: 48.86, longitude: 2.29 },
      ['crewed', 'science', 'earth', 'weather', 'navigation']]
  ])('opens a page addressed %j on %o showing the kinds %o', async (fragment, spot, kinds) => {
    const sky = await loaded(fragment)
    expect([sky.spot.value, sky.showing.value]).toEqual([spot, kinds])
  })

  it.each([
    ['writes the kinds shown beside the spot the address holds', '#48.86,2.29', ['earth', 'starlink'],
      '#48.86,2.29?kinds=earth,starlink'],
    ['writes the kinds shown into an address holding no spot', '', ['comms'], '#?kinds=comms'],
    ['writes an empty list once every kind is switched off', '#48.86,2.29', [], '#48.86,2.29?kinds='],
    ['clears the kinds from the address once they are the ones a first visit shows',
      '#48.86,2.29?kinds=earth', ['crewed', 'science', 'earth', 'weather', 'navigation'], '#48.86,2.29']
  ] as const)('%s', async (_, fragment, kinds, written) => {
    const sky = await loaded(fragment)
    sky.trace(kinds)
    expect(`${location.pathname}${location.search}${location.hash}`).toBe(`/somewhere?at=1${written}`)
  })

  it.each([
    ['keeps the kinds shown beside a chosen spot', (sky: Sky) => sky.pick(SPOT, null),
      '#1.00,2.00?kinds=starlink'],
    ['keeps the kinds shown once the browser locates the reader', (sky: Sky) => sky.locate(SPOT),
      '#?kinds=starlink']
  ])('%s', async (_, move, written) => {
    const sky = await loaded('#48.86,2.29?kinds=starlink')
    move(sky)
    expect(location.hash).toBe(written)
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
    hear({ count: 1, fetched: sky.start.value - days * catalog.DAY, satellites: [], type: 'loaded' })
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

  it('takes a reading at once after a kind is switched off', async () => {
    const sky = await loaded()
    traced([passAt(0, 30)])
    sky.latch(ON_MAP)
    sky.trace(['earth'])
    sky.latch(Uint16Array.of(0, 0, 1, 0, 0, 0, 0, 0))
    expect(sky.reading.value.onMap).toBe(1)
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

  it('counts above the horizon only the kinds shown', async () => {
    const sky = await loaded()
    traced([passAt(0, 30), passAt(200, 30, { ...OTHER, kind: 'weather' }), passAt(2000, 30, OTHER)])
    sky.trace(['weather'])
    sky.seek(500)
    sky.latch(ON_MAP)
    expect(sky.reading.value).toMatchObject({ above: 1, aboveKinds: [0, 0, 0, 1, 0, 0, 0, 0] })
  })
})

describe('the stage', () => {
  const arrived = () => hear({ count: 1, fetched: NOW, satellites: [], type: 'loaded' })
  const failed  = () => hear({ reason: 'Error: The catalog answered 503', type: 'failed' })

  it.each([
    ['fetches the catalog until it arrives', () => {}, 'fetching'],
    ['reads a catalog failing before any of it arrived as unloaded', failed, 'unloaded'],
    ['reads a worker failing to start as unloaded', () => fail(), 'unloaded'],
    ['reads a catalog failing partway as partial', () => {
      arrived()
      failed()
    }, 'partial'],
    ['traces once the catalog arrives', arrived, 'tracing'],
    ['reads a scan that threw as untraced', () => {
      arrived()
      hear({ id: scanned(), type: 'untraced' })
    }, 'untraced'],
    ['finishes once the traces do', () => {
      arrived()
      traced([])
    }, 'traced'],
    ['places nothing from a catalog more than 14 days old', () => {
      hear({ count: 1, fetched: NOW - 15 * catalog.DAY, satellites: [], type: 'loaded' })
    }, 'expired'],
    ['reads a catalog more than 14 days old failing partway as expired', () => {
      hear({ count: 1, fetched: NOW - 15 * catalog.DAY, satellites: [], type: 'loaded' })
      failed()
    }, 'expired']
  ] as const)('%s', async (_, answer, stage) => {
    const sky = await opened()
    answer()
    expect(sky.stage.value).toBe(stage)
  })

  it('ignores a failure of a scan a newer one replaced', async () => {
    const sky = await loaded()
    const id  = scanned()
    sky.scan()
    hear({ id, type: 'untraced' })
    expect(sky.stage.value).toBe('tracing')
  })

  it('scans a new spot after a scan that threw', async () => {
    const sky = await loaded()
    hear({ id: scanned(), type: 'untraced' })
    sky.pick({ latitude: 10, longitude: 20 }, null)
    expect([sky.stage.value, posted.at(-1)])
      .toMatchObject(['tracing', { spot: { latitude: 10 }, type: 'scan' }])
  })

  it('keeps the passes drawn where the catalog fails partway', async () => {
    const sky = await loaded()
    traced([passAt(0, 30)])
    failed()
    expect([sky.stage.value, sky.tracks.passes.length, sky.placed.value]).toEqual(['partial', 1, true])
  })

  it('places nothing until the first passes arrive', async () => {
    const sky    = await loaded()
    const before = sky.placed.value
    hear({
      done    : 1,
      id      : scanned(),
      offsets : new Uint32Array(),
      passes  : [],
      samples : SAMPLES,
      total   : 2,
      track   : new Float32Array(),
      type    : 'passes'
    })
    expect([before, sky.placed.value]).toEqual([false, true])
  })

  it('holds every satellite of the segments loaded, dropping them on a fresh load', async () => {
    const sky = await opened()
    hear({ count: 1, fetched: NOW, satellites: [SATELLITE], type: 'loaded' })
    hear({ count: 2, fetched: NOW, satellites: [OTHER], type: 'loaded' })
    const held = sky.satellites.value
    sky.load()
    expect([held, sky.satellites.value]).toEqual([[SATELLITE, OTHER], []])
  })

  it('loads the site’s catalog file again from the start, dropping the passes drawn', async () => {
    const sky = await loaded()
    traced([passAt(0, 30)])
    failed()
    sky.load()
    expect([sky.stage.value, sky.tracks.passes.length, posted.at(-1), workers.length])
      .toMatchObject(['fetching', 0, { type: 'load', url: `/${catalog.FILE}` }, 4])
  })

  it('asks for the catalog only once the page loads it, and once however often it does', async () => {
    await opened()
    vi.resetModules()
    const { sky } = await import('../../../../docs/.vitepress/lib/state/sky.ts')
    const before  = workers.length
    posted        = []
    sky.loadOnce()
    sky.loadOnce()
    expect([before, workers.length, posted.map(({ type }) => type), sky.stage.value])
      .toEqual([4, 8, ['follow', 'follow', 'follow', 'load'], 'fetching'])
  })

  it('starts a new worker to load again where the first failed to start', async () => {
    const sky = await opened()
    fail()
    sky.load()
    expect([workers.map(({ terminated }) => terminated), sky.stage.value])
      .toEqual([[true, true, true, true, false, false, false, false], 'fetching'])
  })
})

describe('the scan workers', () => {
  /**
   * Returns a batch of scan `id` holding no pass that brings a worker halfway
   * through its traces.
   */
  const halfwayOf = (id: number): Answer => ({
    done    : 1,
    id      : id,
    offsets : new Uint32Array(),
    passes  : [],
    samples : SAMPLES,
    total   : 2,
    track   : new Float32Array(),
    type    : 'passes'
  })

  it.each([[2, 2], [2, 5], [4, 8], [4, 16]])('starts %s workers on %s cores', async (size, cores) => {
    const spy = vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(cores)
    await opened()
    spy.mockRestore()
    expect(workers.length).toBe(size)
  })

  it('hands the lead a port to each helper and each helper the other end of its own', async () => {
    await opened()
    const [follows, [load]] = [posted.slice(0, -1), posted.slice(-1)] as [
      Extract<Asked, { type: 'follow' }>[], Extract<Asked, { type: 'load' }>[]
    ]
    expect([follows.length, new Set(follows.map(({ from }) => from)).size, load.helpers.length])
      .toEqual([3, 3, 3])
  })

  it('scans a segment only once every worker holds it', async () => {
    await opened()
    const segment: Answer = { count: 1, fetched: NOW, satellites: [SATELLITE], type: 'loaded' }
    const scans           = () => posted.filter(({ type }) => type === 'scan').length
    const counted         = workers.map((worker, index) => {
      hearFrom(worker, index ? quietOf(segment)! : segment)
      return scans()
    })
    expect(counted).toEqual([0, 0, 0, 4])
  })

  it('counts the sky once every worker has posted its counts, summing them', async () => {
    const sky     = await loaded()
    const id      = scanned()
    const counted = workers.map(worker => {
      hearFrom(worker, { counts: countsOf(2), id, step: scan.GRID_STEP, type: 'counts' })
      return sky.spoken.value
    })
    expect(counted).toEqual(['', '', '', '8 satellites above the horizon'])
  })

  it('reads the share traced across every worker, finishing once every worker has', async () => {
    const sky   = await loaded()
    const id    = scanned()
    const steps = workers.map(worker => {
      hearFrom(worker, halfwayOf(id))
      hearFrom(worker, { id, type: 'done' })
      return [sky.share.value, sky.done.value]
    })
    expect(steps).toEqual([[0.25, false], [0.5, false], [0.75, false], [1, true]])
  })

  it('starts the share over on a new scan, reading no batch of the scan before it', async () => {
    const sky = await loaded()
    const old = scanned()
    for (const worker of workers) hearFrom(worker, halfwayOf(old))
    sky.scan()
    const reset = sky.share.value
    hearFrom(workers[0], halfwayOf(old))
    hearFrom(workers[0], halfwayOf(scanned()))
    expect([reset, sky.share.value]).toEqual([0, 0.125])
  })
})
