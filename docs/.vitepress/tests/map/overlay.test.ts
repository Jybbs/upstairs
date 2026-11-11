import { expect, it } from 'vitest'

import { Overlay }     from '../../lib/map/overlay.ts'
import { DAY }         from '../../lib/orbit/catalog.ts'
import { TRACK_WIDTH } from '../../lib/orbit/scan.ts'
import { Tracks }      from '../../lib/state/tracks.ts'
import { passOf }      from '../fixtures/passes.ts'

const BOSTON = { latitude: 42.36, longitude: -71.06 }
const CRAFT  = { latitude: 41.86, longitude: -70.56 }
const NORTH  = { latitude: 60, longitude: -71.06 }

/**
 * Builds a canvas whose 2D context ignores every call but `arc`, `beginPath`,
 * `lineTo`, `restore`, `save`, `setLineDash`, and `stroke`, recording the
 * center and radius of each arc drawn while a line dash is set, the gap of
 * each dash set, and the count of lines each stroke draws.
 */
const canvasOf = () => {
  const dashed: number[][] = []
  const gaps: number[]     = []
  const saved: number[]    = []
  let dash                 = 0
  let lines                = 0
  let pending              = 0
  const calls              = {
    arc         : (x: number, y: number, radius: number) => dash && dashed.push([x, y, radius]),
    beginPath   : () => { pending = 0 },
    canvas      : { height: 0, width: 0 },
    lineTo      : () => { pending++ },
    restore     : () => { dash = saved.pop() ?? 0 },
    save        : () => { saved.push(dash) },
    setLineDash : (segments: number[]) => {
      dash = segments.length
      if (dash) gaps.push(segments[1])
    },
    stroke      : () => { lines += pending }
  }
  const context = new Proxy<Record<string | symbol, unknown>>(calls, {
    get: (target, key) => target[key] ?? (() => {})
  })
  const canvas  = { getContext: () => context } as unknown as HTMLCanvasElement
  return { canvas, dashed, gaps, lines: () => lines }
}

/**
 * Writes three samples standing at one place 45 degrees up into `track`,
 * starting at index `from`.
 */
const trackAt = (track: Float32Array, place: typeof BOSTON, from: number) => {
  for (let sample = 0; sample < 3; sample++) {
    track.set([place.latitude, place.longitude, 45], from + sample * TRACK_WIDTH)
  }
}

it.each([
  ['draws the ring 5 km out once 5 km spans 10 px at the satellite', 6.87, true, true, 1],
  ['leaves the ring off while 5 km spans less than 10 px at the satellite', 6.86, true, true, 0],
  ['leaves the ring off with nothing chosen', 7, false, true, 0],
  ['leaves the ring off where the chosen kind is filtered out', 7, true, false, 0]
])('%s', (_, zoom, chosen, traced, rings) => {
  const tracks = new Tracks()
  const pass   = passOf(25544, { riseAt: 0, setAt: 60 })
  const north  = passOf(43013, { kind: 'earth', riseAt: 0, setAt: 60 })
  const track  = new Float32Array(6 * TRACK_WIDTH)
  trackAt(track, CRAFT, 0)
  trackAt(track, NORTH, 3 * TRACK_WIDTH)
  tracks.add([pass, north], track, Uint32Array.of(0, 3 * TRACK_WIDTH), 3)
  const still   = canvasOf()
  const moving  = canvasOf()
  const overlay = new Overlay(still.canvas, moving.canvas, () => ({
    selected : chosen ? pass : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => traced,
    tracks   : tracks
  }))
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, zoom, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(30)
  const { view } = overlay
  expect(moving.dashed).toEqual(Array(rings).fill([
    expect.closeTo(view.column(CRAFT.longitude)),
    expect.closeTo(view.row(CRAFT.latitude)),
    expect.closeTo(5 * view.scale(CRAFT.latitude))
  ]))
})

/**
 * Chooses a pass standing over Boston at `zoom`, returning the ring's radius
 * and a function that draws the ring 7200 s into a window opening `age` days
 * past the pass's epoch less those 7200 s, returning the gap between its dots.
 */
const ringAt = (zoom: number) => {
  const tracks = new Tracks()
  const pass   = passOf(25544, { epoch: 10 * DAY, riseAt: 0, setAt: 7200 })
  const track  = new Float32Array(3 * TRACK_WIDTH)
  trackAt(track, BOSTON, 0)
  tracks.add([pass], track, Uint32Array.of(0), 3)
  const moving  = canvasOf()
  let start     = 0
  const overlay = new Overlay(canvasOf().canvas, moving.canvas, () => ({
    selected : pass,
    spot     : BOSTON,
    start    : start,
    traced   : () => true,
    tracks   : tracks
  }))
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, zoom, BOSTON.longitude, BOSTON.latitude)
  const gapAt = (age: number) => {
    start = pass.epoch + age * DAY - 7_200_000
    overlay.draw(7200)
    return moving.gaps[moving.gaps.length - 1]
  }
  return { gapAt, radius: 5 * overlay.view.scale(BOSTON.latitude) }
}

it.each([
  [0.5, 1],
  [1, 1],
  [1.01, 2],
  [3, 2],
  [3.01, 3],
  [5, 3]
])('spaces the ring\'s dots %f days past the epoch %i times as far apart as at it', (age, spread) => {
  const { gapAt } = ringAt(9)
  expect(gapAt(age) / gapAt(0)).toBeCloseTo(spread, 0)
})

it.each([
  [0.5, 14],
  [2, 7],
  [5, 5]
])('draws a 10 px ring %f days past the epoch with %i dots', (age, dots) => {
  const { gapAt, radius } = ringAt(6.87)
  expect(radius).toBeCloseTo(10, 0)
  expect(Math.round(2 * Math.PI * radius / gapAt(age))).toBe(dots)
})

it.each([
  ['a path crossing the view between two samples outside it', -1, 1, 1],
  ['a path whose samples and the line between them stay east of the view', 1, 2, 0],
  ['a path stepping across the far side of the world', 179.5, 180.5, 0]
])('marks and draws %s as crossing: %i', (_, west, east, crossing) => {
  const tracks = new Tracks()
  const track  = new Float32Array(2 * TRACK_WIDTH)
  track.set([BOSTON.latitude, BOSTON.longitude + west, 45], 0)
  track.set([BOSTON.latitude, BOSTON.longitude + east, 45], TRACK_WIDTH)
  tracks.add([passOf(25544, { riseAt: 0, setAt: 30 })], track, Uint32Array.of(0), 2)
  const still   = canvasOf()
  const overlay = new Overlay(still.canvas, canvasOf().canvas, () => ({
    selected : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  }))
  overlay.view.set(400, 400, 9, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(15)
  expect(Array.from(overlay.crossing(tracks))).toEqual([crossing])
  expect(still.lines()).toBe(crossing)
})
