import { expect, it, vi } from 'vitest'

import type { Box }             from '../../../lib/map/mercator.ts'
import { BEADS, type Label, Overlay, fadeOf, nearnessOf, openOf } from '../../../lib/map/overlay.ts'
import { DAY }                  from '../../../lib/orbit/catalog.ts'
import { kindOrder, type Kind } from '../../../lib/orbit/kinds.ts'
import { iconOf }               from '../../../lib/site/icons.ts'
import { SCHEMES }              from '../../../lib/site/palette.ts'
import { TRACK_WIDTH }          from '../../../lib/orbit/scan.ts'
import { Tracks }               from '../../../lib/state/tracks.ts'
import { passOf }               from '../../common/passes.ts'
import { canvasWith }           from '../../common/stubs.ts'

/**
 * A text a canvas filled: its alpha, style, font, letter spacing, and halo's
 * width, the `row` it was set at, and the column and row its transform last
 * moved to.
 */
interface Filled {
  alpha   : number
  at      : number
  down    : number
  font    : unknown
  halo    : unknown
  row     : number
  spacing : unknown
  style   : unknown
  text    : string
}

const BOSTON = { latitude: 42.36, longitude: -71.06 }
const CRAFT  = { latitude: 41.86, longitude: -70.56 }
const NORTH  = { latitude: 60, longitude: -71.06 }

/**
 * Builds a canvas whose 2D context ignores every call but `arc`, `fill`,
 * `restore`, `save`, `setLineDash`, and `stroke`, recording the center of
 * every arc, the center and radius of each arc drawn while a line dash is set,
 * the gap of each dash set, the stroke style of each stroke while a dash is
 * set, the alpha of each fill, and each path a fill is given.
 */
const canvasOf = () => {
  const alphas: number[]   = []
  const centers: number[][] = []
  const dashed: number[][] = []
  const gaps: number[]     = []
  const paths: unknown[]   = []
  const saved: number[]    = []
  const strokes: unknown[] = []
  let dash                 = 0
  const calls              = {
    arc         : (x: number, y: number, radius: number) => {
      centers.push([x, y])
      if (dash) dashed.push([x, y, radius])
    },
    fill        : (path?: unknown) => {
      alphas.push(context.globalAlpha as number)
      if (path) paths.push(path)
    },
    restore     : () => { dash = saved.pop() ?? 0 },
    save        : () => { saved.push(dash) },
    setLineDash : (segments: number[]) => {
      dash = segments.length
      if (dash) gaps.push(segments[1])
    },
    stroke      : () => { if (dash) strokes.push(context.strokeStyle) }
  }
  const { canvas, context } = canvasWith(calls)
  return { alphas, canvas, centers, dashed, gaps, paths, strokes }
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
  ['draws the ring around a chosen satellite whose kind the filters leave out', 7, true, false, 1]
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
  const overlay = new Overlay(still.canvas, moving.canvas, {
    gathered : false,
    held     : null,
    named    : null,
    reduced  : true,
    selected : chosen ? pass : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => traced,
    tracks   : tracks
  })
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
 * Draws a crewed pass over Plymouth and an Earth-observing one over Boston at
 * `zoom` with `named` set on the tally, returning the overlay and the moving
 * canvas.
 */
const pairAt = (zoom: number, named: Kind | null, traced: boolean) => {
  const tracks = new Tracks()
  const track  = new Float32Array(6 * TRACK_WIDTH)
  trackAt(track, CRAFT, 0)
  trackAt(track, BOSTON, 3 * TRACK_WIDTH)
  const passes = [
    passOf(25544, { riseAt: 0, setAt: 60 }), passOf(43013, { kind: 'earth', riseAt: 0, setAt: 60 })
  ]
  tracks.add(passes, track, Uint32Array.of(0, 3 * TRACK_WIDTH), 3)
  const moving  = canvasOf()
  const overlay = new Overlay(canvasOf().canvas, moving.canvas, {
    gathered : false,
    held     : null,
    named    : named,
    reduced  : true,
    selected : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => traced,
    tracks   : tracks
  })
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, zoom, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(30)
  return { moving, overlay }
}

it.each([
  ['dims each kind the filters leave out but the one the tally names, its beads included', false],
  ['dims each kind the filters show but the one the tally names, its beads included', true]
])('%s', (_, traced) => {
  const plain = pairAt(7, null, traced).moving.alphas
  const named = pairAt(7, 'earth', traced).moving.alphas
  expect(named.map((alpha, index) => alpha / plain[index]))
    .toEqual(plain.map((_, index) => expect.closeTo(index < plain.length / 2 ? 0.16 : 1)))
})

it('draws a satellite the filters leave out at half strength, its beads included', () => {
  const traced = pairAt(7, null, true).moving.alphas
  const left   = pairAt(7, null, false).moving.alphas
  expect(left.map((alpha, index) => alpha / traced[index])).toEqual(traced.map(() => expect.closeTo(0.5)))
})

it.each([
  ['counts each kind standing inside the view', 7, { crewed: 1, earth: 1 }],
  ['leaves out a satellite inside the drawing margin but past the edge of the view', 7.8, { earth: 1 }]
])('%s', (_, zoom, counts) => {
  const { onMap } = pairAt(zoom, null, true).overlay
  expect(Object.fromEntries(kindOrder.flatMap((kind, index) => onMap[index] ? [[kind, onMap[index]]] : [])))
    .toEqual(counts)
})

/**
 * Chooses a pass standing over Boston with the view at `zoom`, returning the
 * ring's radius in px beside `gapAt`, which draws the ring 7200 s into a
 * window placed so the frame falls `age` days past the pass's epoch and
 * returns the gap between its dots.
 */
const ringAt = (zoom: number) => {
  const tracks = new Tracks()
  const pass   = passOf(25544, { epoch: 10 * DAY, riseAt: 0, setAt: 7200 })
  const track  = new Float32Array(3 * TRACK_WIDTH)
  trackAt(track, BOSTON, 0)
  tracks.add([pass], track, Uint32Array.of(0), 3)
  const moving  = canvasOf()
  const state   = {
    gathered : false,
    held     : null,
    named    : null,
    reduced  : true,
    selected : pass,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  }
  const overlay = new Overlay(canvasOf().canvas, moving.canvas, state)
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, zoom, BOSTON.longitude, BOSTON.latitude)
  const gapAt = (age: number) => {
    state.start = pass.epoch + age * DAY - 7_200_000
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

it.each(Object.entries(SCHEMES))('strokes the %s ring in its halo and the kind’s color', (_, scheme) => {
  const tracks = new Tracks()
  const pass   = passOf(25544, { kind: 'weather', riseAt: 0, setAt: 60 })
  const track  = new Float32Array(3 * TRACK_WIDTH)
  trackAt(track, BOSTON, 0)
  tracks.add([pass], track, Uint32Array.of(0), 3)
  const moving  = canvasOf()
  const overlay = new Overlay(canvasOf().canvas, moving.canvas, {
    gathered : false,
    held     : null,
    named    : null,
    reduced  : true,
    selected : pass,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  })
  overlay.scheme = scheme
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, 9, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(30)
  expect(moving.strokes).toEqual([scheme.halo, scheme.kinds.weather])
})

it.each([
  ['a path crossing the view between two samples outside it', -1, 1, 1],
  ['a path whose samples and the line between them stay east of the view', 1, 2, 0],
  ['a path stepping across the far side of the world', 179.5, 180.5, 0]
])('marks %s as crossing: %i', (_, west, east, crossing) => {
  const tracks = new Tracks()
  const track  = new Float32Array(2 * TRACK_WIDTH)
  track.set([BOSTON.latitude, BOSTON.longitude + west, 45], 0)
  track.set([BOSTON.latitude, BOSTON.longitude + east, 45], TRACK_WIDTH)
  tracks.add([passOf(25544, { riseAt: 0, setAt: 30 })], track, Uint32Array.of(0), 2)
  const still   = canvasOf()
  const overlay = new Overlay(still.canvas, canvasOf().canvas, {
    gathered : false,
    held     : null,
    named    : null,
    reduced  : true,
    selected : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  })
  overlay.view.set(400, 400, 9, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(15)
  expect(Array.from(overlay.crossing(tracks))).toEqual([crossing])
})

it.each([
  ['stays filled up to its nearest point', 600, 0],
  ['is half open halfway through its turn', 625, 0.5],
  ['is open once its turn is over', 650, 1]
])('a dot of a ten-minute pass %s', (_, seconds, open) => {
  expect(openOf(passOf(1), seconds)).toBeCloseTo(open)
})

it.each([
  ['a pass of a minute, held to 20 seconds', 60, 20],
  ['a pass of an hour, held to 3 minutes', 3600, 180]
])('turns from filled to open over %s', (_, length, turn) => {
  const pass = passOf(1, { peakAt: 0, riseAt: 0, setAt: length })
  expect([openOf(pass, turn / 2), openOf(pass, turn)]).toEqual([expect.closeTo(0.5), 1])
})

it.each([
  ['fades in over its first 40 seconds', {}, 320, 0.5],
  ['stands whole where the pass is up before the window opens', { earlier: true }, 300, 1],
  ['fades out over its last 40 seconds', {}, 880, 0.5],
  ['stands whole where the pass is up after the window closes', { later: true }, 900, 1]
])('a dot %s', (_, changes, seconds, strength) => {
  expect(fadeOf(passOf(1, changes), seconds)).toBeCloseTo(strength)
})

it.each([
  ['stands nearest straight overhead 400 km up', 400, 90, 1],
  ['stands farthest on the horizon of a geostationary orbit', 35_786, 0, 0]
])('a satellite %s', (_, height, elevation, nearness) => {
  expect(nearnessOf(height, elevation)).toBeCloseTo(nearness)
})

/**
 * Draws one crewed satellite crossing the view eastward at `seconds` into the
 * window, returning the centers of its beads, every arc drawn before its halo
 * and dot.
 */
const beadsAt = (seconds: number) => {
  const tracks = new Tracks()
  const track  = new Float32Array(121 * TRACK_WIDTH)
  for (let sample = 0; sample < 121; sample++) {
    track.set([BOSTON.latitude, BOSTON.longitude - 1 + sample / 60, 45], sample * TRACK_WIDTH)
  }
  tracks.add([passOf(25544, { peakAt: 3000, riseAt: 0, setAt: 3600 })], track, Uint32Array.of(0), 121)
  const moving  = canvasOf()
  const drawing = new Overlay(canvasOf().canvas, moving.canvas, {
    gathered : false,
    held     : null,
    named    : null,
    reduced  : true,
    selected : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  })
  drawing.resize(400, 400, 1)
  drawing.view.set(400, 400, 9, BOSTON.longitude, BOSTON.latitude)
  drawing.draw(seconds)
  return moving.centers.slice(0, -2)
}

it('lays its beads at least 9 px apart and under twice that', () => {
  const beads = beadsAt(1800)
  const gaps  = beads.slice(1).map(([x, y], index) => Math.hypot(x - beads[index][0], y - beads[index][1]))
  expect([beads.length, gaps.filter(gap => gap < BEADS.gap || gap >= 2 * BEADS.gap)])
    .toStrictEqual([BEADS.count, []])
})

it('holds each bead at its place on the ground as the satellite moves on', () => {
  const before = beadsAt(1800)
  const after  = beadsAt(1801)
  expect(after.slice(0, -1))
    .toEqual(before.slice(0, -1).map(([x, y]) => [expect.closeTo(x), expect.closeTo(y)]))
})

it.each([
  ['up and to the right of the held satellite', CRAFT, 1, -1],
  ['to the left of a held satellite at the view\'s right edge',
    { latitude: 42.36, longitude: -70.02 }, -1, -1]
])('draws the held kind\'s mark on its halo %s', (_, place, across, down) => {
  vi.stubGlobal('Path2D', class { constructor(readonly d: string) {} })
  const tracks = new Tracks()
  const pass   = passOf(25544, { riseAt: 0, setAt: 60 })
  const track  = new Float32Array(3 * TRACK_WIDTH)
  trackAt(track, place, 0)
  tracks.add([pass], track, Uint32Array.of(0), 3)
  const moving  = canvasOf()
  const overlay = new Overlay(canvasOf().canvas, moving.canvas, {
    gathered : false,
    held     : pass,
    named    : null,
    reduced  : true,
    selected : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  })
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, 7, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(30)
  const [x, y] = [overlay.view.column(place.longitude), overlay.view.row(place.latitude)]
  expect(moving.paths).toEqual([{ d: iconOf('crewed', 16) }])
  expect(moving.centers).toContainEqual([expect.closeTo(x + 15 * across), expect.closeTo(y + 15 * down)])
  vi.unstubAllGlobals()
})

it.each([
  ['draws every pass not yet set onto its point of the numeral once gathered', true,
    [[100, 100], [300, 100]]],
  ['draws each pass where it stands once let go', false, [[100, 100], [300, 100]]]
] as const)('%s', (_, gathered, slots) => {
  const tracks = new Tracks()
  const track  = new Float32Array(6 * TRACK_WIDTH)
  trackAt(track, CRAFT, 0)
  trackAt(track, BOSTON, 3 * TRACK_WIDTH)
  const passes = [
    passOf(25544, { riseAt: 0, setAt: 60 }), passOf(43013, { kind: 'earth', riseAt: 0, setAt: 60 })
  ]
  tracks.add(passes, track, Uint32Array.of(0, 3 * TRACK_WIDTH), 3)
  const moving  = canvasOf()
  const overlay = new Overlay(canvasOf().canvas, moving.canvas, {
    gathered : gathered,
    held     : null,
    named    : null,
    reduced  : true,
    selected : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  })
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, 7, BOSTON.longitude, BOSTON.latitude)
  const counts: number[] = []
  overlay.gather(tracks, 30, count => {
    counts.push(count)
    return slots
  })
  overlay.draw(30)
  const { view } = overlay
  const standing = [[view.column(CRAFT.longitude), view.row(CRAFT.latitude)], [200, 200]]
  const points   = (gathered ? [slots[1], slots[0]] : standing)
    .map(([x, y]) => [expect.closeTo(x), expect.closeTo(y)])
  expect(counts).toEqual([2])
  expect(moving.centers).toEqual(expect.arrayContaining(points))
  expect(moving.centers.some(([x, y]) => x === 100 && y === 100)).toBe(gathered)
})

/**
 * Builds a canvas whose 2D context ignores every call but `arc`, `beginPath`,
 * `fill`, `lineTo`, and `stroke`, recording the width and alpha of each
 * ribbon filled and the alpha, radius, and fill style of each disc and ring
 * drawn.
 */
const sketchOf = () => {
  const marks: { alpha: number, filled: boolean, radius: number, style: unknown }[] = []
  const ribbons: { alpha: number, width: number }[] = []
  let points: number[][] = []
  let radius             = 0
  let round              = false
  const calls            = {
    arc       : (_x: number, _y: number, size: number) => {
      radius = size
      round  = true
    },
    beginPath : () => {
      points = []
      round  = false
    },
    fill      : () => {
      const alpha = context.globalAlpha as number
      if (round) return marks.push({ alpha, filled: true, radius, style: context.fillStyle })
      const [[x, y], [u, v]] = [points[0], points.at(-1)!]
      ribbons.push({ alpha, width: Math.hypot(u - x, v - y) })
    },
    lineTo    : (x: number, y: number) => points.push([x, y]),
    stroke    : () => {
      if (round) marks.push({ alpha: context.globalAlpha as number, filled: false, radius, style: null })
    }
  }
  const { canvas, context } = canvasWith(calls)
  return { canvas, marks, ribbons }
}

/**
 * Draws one satellite crossing the view eastward at `elevation` degrees,
 * through a pass `changes` sets, chosen or held as `as` names, at `seconds`
 * into the window, its kind shown or left out by the filters as `traced` sets.
 */
const drawnAt = (
  seconds   : number,
  elevation : number,
  as        : 'held' | 'none' | 'selected',
  changes   = {},
  traced    = true
) => {
  const tracks = new Tracks()
  const track  = new Float32Array(121 * TRACK_WIDTH)
  for (let sample = 0; sample < 121; sample++) {
    track.set([BOSTON.latitude, BOSTON.longitude - 1 + sample / 60, elevation], sample * TRACK_WIDTH)
  }
  const pass = passOf(25544, { peakAt: 1800, riseAt: 0, setAt: 3600, ...changes })
  tracks.add([pass], track, Uint32Array.of(0), 121)
  const sketch  = sketchOf()
  const overlay = new Overlay(sketchOf().canvas, sketch.canvas, {
    gathered : false,
    held     : as === 'held' ? pass : null,
    named    : null,
    reduced  : true,
    selected : as === 'selected' ? pass : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => traced,
    tracks   : tracks
  })
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, 9, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(seconds)
  return sketch
}

it.each([
  ['draws the chosen track 1 px wide at the horizon', 'selected', 0, 1],
  ['draws the chosen track 6 px wide straight overhead', 'selected', 90, 6],
  ['widens the chosen track on the sine of its elevation', 'selected', 30, 3.5],
  ['swells the held track to 3 px straight overhead', 'held', 90, 3]
] as const)('%s', (_, as, elevation, width) => {
  const { ribbons } = drawnAt(900, elevation, as)
  expect(ribbons.filter((_, index) => index % 2).map(ribbon => ribbon.width))
    .toEqual(ribbons.filter((_, index) => index % 2).map(() => expect.closeTo(width)))
  expect(ribbons.length).toBeGreaterThan(0)
})

it('draws the stretch flown at a third, at once under reduced motion, and marks the peak', () => {
  const { marks, ribbons } = drawnAt(900, 45, 'selected')
  expect([ribbons.map(({ alpha }) => alpha), marks.length])
    .toEqual([[0.7 / 3, 1 / 3, 0.7, 1].map(alpha => expect.closeTo(alpha)), 2])
})

it.each([
  ['draws the held track of a pass whose kind the filters leave out', 'held'],
  ['draws the chosen track and its peak for a pass whose kind the filters leave out', 'selected']
] as const)('%s', (_, as) => {
  const shown = drawnAt(900, 45, as)
  const left  = drawnAt(900, 45, as, {}, false)
  expect([left.ribbons, left.marks.length]).toEqual([shown.ribbons, shown.marks.length])
  expect(left.ribbons.length).toBeGreaterThan(0)
})

it('leaves filled beads behind a satellite drawing nearer and open ones behind one going', () => {
  const { marks } = drawnAt(1800, 45, 'none', { peakAt: 1760, riseAt: 1700, setAt: 1900 })
  expect(marks.slice(0, 3).map(({ filled }) => filled)).toEqual([false, true, true])
})

it('fades each bead with its age', () => {
  const { marks } = drawnAt(1800, 45, 'none')
  const beads     = marks.slice(0, -2).map(({ alpha }) => alpha)
  expect(beads).toEqual(beads.toSorted((a, b) => b - a))
  expect(new Set(beads).size).toBe(beads.length)
})

it.each([
  ['draws the chosen dot and its beads in its kind’s color', 'selected', true],
  ['draws every other dot and its beads in the one tone', 'none', false]
] as const)('%s', (_, as, colored) => {
  const { marks } = drawnAt(1800, 45, as)
  expect(marks.some(({ style }) => style === SCHEMES.day.kinds.crewed)).toBe(colored)
})

it.each([
  ['draws no craft docked to the chosen one over it', 'station', 'selected', false, 1],
  ['draws a docked craft a search by name chooses over the station it flies with',
    'docked', 'selected', true, 2],
  ['draws a docked craft the readout holds over the station it flies with', 'docked', 'held', true, 2]
] as const)('%s', (_, which, as, dimmed, drawn) => {
  vi.stubGlobal('Path2D', class { constructor(readonly d: string) {} })
  const tracks = new Tracks()
  const track  = new Float32Array(121 * TRACK_WIDTH)
  for (let sample = 0; sample < 121; sample++) {
    track.set([BOSTON.latitude, BOSTON.longitude - 1 + sample / 60, 45], sample * TRACK_WIDTH)
  }
  const station = passOf(25544, { peakAt: 1800, riseAt: 0, setAt: 3600 })
  const docked  = passOf(49044, { peakAt: 1800, riseAt: 0, setAt: 3600 })
  const pass    = which === 'station' ? station : docked
  tracks.add([station, docked], track, Uint32Array.of(0, 0), 121)
  const sketch  = sketchOf()
  const overlay = new Overlay(sketchOf().canvas, sketch.canvas, {
    gathered : false,
    held     : as === 'held' ? pass : null,
    named    : null,
    reduced  : true,
    selected : as === 'selected' ? pass : null,
    spot     : BOSTON,
    start    : 0,
    traced   : index => !tracks.docked.has(index),
    tracks   : tracks
  })
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, 9, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(1800)
  const styles         = sketch.marks.map(({ style }) => style)
  const crewed         = overlay.onMap[kindOrder.indexOf('crewed')]
  const { dim, kinds } = SCHEMES.day
  expect([[...tracks.docked], styles.includes(dim), styles.includes(kinds.crewed), crewed])
    .toEqual([[1], dimmed, true, drawn])
  vi.unstubAllGlobals()
})

it.each([
  ['gathers only the passes still up or yet to rise', 0, 20, [1]],
  ['gathers every pass not yet set', 0, 60, [2]]
] as const)('%s', (_, riseAt, setAt, counts) => {
  const tracks = new Tracks()
  const track  = new Float32Array(6 * TRACK_WIDTH)
  trackAt(track, CRAFT, 0)
  trackAt(track, BOSTON, 3 * TRACK_WIDTH)
  tracks.add([passOf(25544, { riseAt, setAt }), passOf(43013, { riseAt: 0, setAt: 60 })],
    track, Uint32Array.of(0, 3 * TRACK_WIDTH), 3)
  const overlay = new Overlay(canvasOf().canvas, canvasOf().canvas, {
    gathered : true,
    held     : null,
    named    : null,
    reduced  : true,
    selected : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  })
  const seen: number[] = []
  overlay.gather(tracks, 30, count => {
    seen.push(count)
    return []
  })
  expect(seen).toEqual(counts)
})

it('draws each gathered satellite 3 px round on its halo once the sky has gathered', () => {
  const tracks = new Tracks()
  const track  = new Float32Array(3 * TRACK_WIDTH)
  trackAt(track, CRAFT, 0)
  tracks.add([passOf(25544, { riseAt: 0, setAt: 60 })], track, Uint32Array.of(0), 3)
  const sketch  = sketchOf()
  const overlay = new Overlay(sketchOf().canvas, sketch.canvas, {
    gathered : true,
    held     : null,
    named    : null,
    reduced  : true,
    selected : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  })
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, 7, BOSTON.longitude, BOSTON.latitude)
  overlay.gather(tracks, 30, () => [[100, 100]])
  overlay.draw(30)
  expect(sketch.marks.map(({ radius }) => radius)).toEqual([4.5, 3])
})

it('draws none of the gathered points once their tracks are cleared', () => {
  const tracks = new Tracks()
  const track  = new Float32Array(3 * TRACK_WIDTH)
  trackAt(track, CRAFT, 0)
  tracks.add([passOf(25544, { riseAt: 0, setAt: 60 })], track, Uint32Array.of(0), 3)
  const sketch  = sketchOf()
  const overlay = new Overlay(sketchOf().canvas, sketch.canvas, {
    gathered : true,
    held     : null,
    named    : null,
    reduced  : true,
    selected : null,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  })
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, 7, BOSTON.longitude, BOSTON.latitude)
  overlay.gather(tracks, 30, () => [[100, 100]])
  tracks.clear()
  overlay.draw(30)
  expect(sketch.marks).toEqual([])
})

it.each([
  ['rings the spot where the map has one', BOSTON, 1],
  ['draws no ring where the map has no spot', null, 0]
])('%s', (_, spot, rings) => {
  const still   = canvasOf()
  const overlay = new Overlay(still.canvas, canvasOf().canvas, {
    gathered : false,
    held     : null,
    named    : null,
    reduced  : true,
    selected : null,
    spot     : spot,
    start    : 0,
    traced   : () => true,
    tracks   : new Tracks()
  })
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, 9, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(0)
  expect(still.dashed).toHaveLength(rings)
})

/**
 * Builds a canvas whose 2D context records each text it fills as `Filled`
 * holds it, each stop of each gradient it makes, each rectangle it adds to a
 * path, each rectangle it fills with its alpha, each time it clears, and the
 * order of its path calls.
 */
const pageOf = () => {
  const circles: number[][]                         = []
  const cleared: number[]                           = []
  const filled: { alpha: number, height: number }[] = []
  const paths: string[]                             = []
  const rects: number[][]                           = []
  const stops: [number, string][]                   = []
  const texts: Filled[]                             = []
  let at                                            = 0
  let down                                          = 0
  const calls                                       = {
    arc       : () => { paths.push('arc') },
    clearRect : () => { cleared.push(1) },
    clip      : () => { paths.push('clip') },
    createRadialGradient : (...circle: number[]) => {
      circles.push(circle)
      return { addColorStop: (offset: number, color: string) => stops.push([offset, color]) }
    },
    fillRect  : (_x: number, _y: number, _width: number, height: number) =>
      filled.push({ alpha: context.globalAlpha as number, height }),
    fillText  : (text: string, _x: number, y: number) =>
      texts.push({
        alpha   : context.globalAlpha as number,
        at      : at,
        down    : down,
        font    : context.font,
        halo    : context.lineWidth,
        row     : y,
        spacing : context.letterSpacing,
        style   : context.fillStyle,
        text    : text
      }),
    rect         : (...box: number[]) => {
      paths.push('rect')
      rects.push(box)
    },
    setTransform : (...matrix: number[]) => { [at, down] = [matrix[4], matrix[5]] }
  }
  const { canvas, context } = canvasWith(calls)
  return { canvas, circles, cleared, filled, paths, rects, stops, texts }
}

/**
 * Draws the names `labels` round a spot over Boston on a view `width` pixels
 * wide at `zoom`.
 */
const namedAt = (
  labels  : Label[],
  {
    covered = [] as Box[],
    spot    = BOSTON as typeof BOSTON | null,
    width   = 1440,
    zoom    = 6
  } = {}
) => {
  const still   = pageOf()
  const moving  = pageOf()
  const state   = {
    gathered : false,
    held     : null,
    named    : null,
    reduced  : true,
    selected : null,
    spot     : spot,
    start    : 0,
    traced   : () => true,
    tracks   : new Tracks()
  }
  const overlay = new Overlay(still.canvas, moving.canvas, state)
  overlay.covered = () => covered
  overlay.labels  = labels
  overlay.resize(width, 800, 1)
  overlay.view.set(width, 800, zoom, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(0)
  return { moving, overlay, state, still }
}

const ALBANY = { latitude: 42.65, longitude: -73.75, name: 'Albany', tier: 'city' as const }
const GULF   = { latitude: 43, longitude: -68.5, name: 'Gulf of Maine', tier: 'water' as const }
const MAINE  = { latitude: 45.2, longitude: -69.2, name: 'Maine', tier: 'region' as const }

it.each([
  ['sets a city in its own case in the label tone', ALBANY, 'Albany', SCHEMES.day.label, '500 15.5px', '0px'],
  ['sets a region in spaced quiet capitals', MAINE, 'MAINE', SCHEMES.day.quiet, '500 12px', '3.8px'],
  ['sets a water in quiet italics', GULF, 'Gulf of Maine', SCHEMES.day.quiet, 'italic 15.5px', '0.2px']
])('%s', (_, label, text, style, size, spacing) => {
  const [set] = namedAt([label]).still.texts
  expect([set.text, set.style, String(set.font).startsWith(size), set.spacing])
    .toEqual([text, style, true, spacing])
})

it.each([
  ['sets the larger faces from 1280 px', ALBANY, 1280, '500 15.5px', '0px'],
  ['sets the smaller faces below 1280 px', ALBANY, 1279, '13px', '0px'],
  ['spaces a region’s capitals closer below 1280 px', MAINE, 1279, '500 10.5px', '1.6px'],
  ['sets a water in smaller unspaced italics below 1280 px', GULF, 1279, 'italic 13px', '0px']
])('%s', (_, label, width, size, spacing) => {
  const [set] = namedAt([label], { width }).still.texts
  expect([String(set.font).startsWith(size), set.spacing]).toEqual([true, spacing])
})

it('eases the veil in from clear at the ring to the page’s tone', () =>
  expect(namedAt([]).moving.stops).toEqual([[0, `${SCHEMES.day.page}00`], [1, SCHEMES.day.page]]))

it('eases the veil in from 1.5 px past the ring across 0.9 of its radius', () => {
  const { moving, overlay } = namedAt([])
  const radius              = 290 * overlay.view.scale(BOSTON.latitude)
  const [, , from, , , to]  = moving.circles[0]
  expect([from - radius, (to - from) / radius]).toEqual([expect.closeTo(1.5), expect.closeTo(0.9)])
})

it.each([
  ['sets no caption on a ring 56 px across or less', 3, 0],
  ['sets the caption on a ring wider than 56 px', 3.6, 16]
])('%s', (_, zoom, letters) => expect(namedAt([], { zoom }).moving.texts).toHaveLength(letters))

it('keeps at most 20 names below 1280 px', () => {
  const labels = Array.from({ length: 30 }, (_, index) => ({
    latitude  : 40 + Math.floor(index / 6) * 0.8,
    longitude : -78 + (index % 6) * 1.6,
    name      : `P${index}`,
    tier      : 'city' as const
  }))
  const narrow = namedAt(labels, { spot: null, width: 1279 }).still.texts
  const wide   = namedAt(labels, { spot: null }).still.texts
  expect([narrow.length, wide.length]).toEqual([20, 30])
})

it('passes over a name on the spot’s marker', () =>
  expect(namedAt([{ ...BOSTON, name: 'Boston', tier: 'city' }]).still.texts).toEqual([]))

it('sets the ring’s caption letter by letter over the veil, and leaves both off with no spot', () => {
  const ringed = namedAt([])
  const bare   = namedAt([], { spot: null })
  expect(ringed.moving.texts.map(({ text }) => text).join('')).toBe('60° UP AT 550 KM')
  expect(ringed.moving.filled).toEqual([{ alpha: 0.4, height: 800 }])
  expect([bare.moving.texts, bare.moving.filled, ringed.still.texts]).toEqual([[], [], []])
})

it('sets the caption in the 10 px mono, 1.4 px between letters', () => {
  const caption = namedAt([]).moving.texts
  const gaps    = caption.slice(1).map(({ at, down }, index) =>
    Math.hypot(at - caption[index].at, down - caption[index].down))
  expect([caption.every(({ font }) => String(font).startsWith('500 10px')), gaps])
    .toEqual([true, gaps.map(() => expect.closeTo(8.4, 1))])
})

it('strokes each name and each of the caption’s letters with a 3.5 px halo', () => {
  const { moving, still } = namedAt([ALBANY])
  expect([...still.texts, ...moving.texts].map(({ halo }) => halo))
    .toEqual(Array(still.texts.length + moving.texts.length).fill(3.5))
})

it('leaves clear of the veil each name whose place stands inside the ring alone', () => {
  const { moving, overlay } = namedAt([ALBANY, MAINE])
  expect(moving.rects).toHaveLength(2)
  expect(moving.rects[1][0]).toBeLessThan(overlay.view.column(ALBANY.longitude))
})

it('places the names again once another pass is chosen, and not before', () => {
  const { overlay, state, still } = namedAt([ALBANY])
  overlay.draw(1)
  const once = still.cleared.length
  Object.assign(state, { selected: passOf(25544) })
  overlay.draw(2)
  expect([once, still.cleared.length]).toEqual([1, 2])
})

it.each([
  ['above the ring where nothing covers it', []],
  ['below the ring where a panel covers the map above the spot',
    [{ bottom: 400, left: 0, right: 1440, top: 0 }]]
])('sets the caption left to right %s', (_, covered) => {
  const columns = namedAt([], { covered }).moving.texts.map(({ at }) => at)
  expect(columns.slice(1).every((column, index) => column > columns[index])).toBe(true)
})

it.each([
  ['leaves a circle clear round the chosen satellite while it flies', 1800, 'arc'],
  ['leaves no circle once the chosen pass has set', 3700, 'rect']
])('the veil %s', (_, seconds, last) => {
  const tracks = new Tracks()
  const track  = new Float32Array(121 * TRACK_WIDTH)
  for (let sample = 0; sample < 121; sample++) {
    track.set([BOSTON.latitude, BOSTON.longitude - 1 + sample / 60, 45], sample * TRACK_WIDTH)
  }
  const pass   = passOf(25544, { peakAt: 1800, riseAt: 0, setAt: 3600 })
  tracks.add([pass], track, Uint32Array.of(0), 121)
  const moving  = pageOf()
  const overlay = new Overlay(pageOf().canvas, moving.canvas, {
    gathered : false,
    held     : null,
    named    : null,
    reduced  : true,
    selected : pass,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  })
  overlay.resize(1440, 800, 1)
  overlay.view.set(1440, 800, 6, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(seconds)
  expect(moving.paths[moving.paths.lastIndexOf('clip') - 1]).toBe(last)
})

it('passes over a name under a panel', () => {
  const covered = [{ bottom: 800, left: 0, right: 720, top: 0 }]
  expect(namedAt([ALBANY], { covered }).still.texts).toEqual([])
})

it('passes over a name the chosen track crosses', () => {
  const tracks = new Tracks()
  const track  = new Float32Array(121 * TRACK_WIDTH)
  for (let sample = 0; sample < 121; sample++) {
    track.set([ALBANY.latitude, -75 + sample / 40, 45], sample * TRACK_WIDTH)
  }
  const pass   = passOf(25544, { peakAt: 1800, riseAt: 0, setAt: 3600 })
  tracks.add([pass], track, Uint32Array.of(0), 121)
  const still   = pageOf()
  const overlay = new Overlay(still.canvas, pageOf().canvas, {
    gathered : false,
    held     : null,
    named    : null,
    reduced  : true,
    selected : pass,
    spot     : BOSTON,
    start    : 0,
    traced   : () => true,
    tracks   : tracks
  })
  overlay.labels = [ALBANY]
  overlay.resize(1440, 800, 1)
  overlay.view.set(1440, 800, 6, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(0)
  expect(still.texts).toEqual([])
})

it('moves a name off the ring’s caption by the caption’s clearance', () => {
  const view = namedAt([]).overlay.view
  const top  = view.row(BOSTON.latitude) - 290 * view.scale(BOSTON.latitude) - 17
  let [south, north] = [-85, 85]
  for (let step = 0; step < 60; step++) {
    const middle = (south + north) / 2
    if (view.row(middle) > top - 7) south = middle
    else north = middle
  }
  const name  = { latitude: south, longitude: BOSTON.longitude, name: 'Ab', tier: 'city' as const }
  const [set] = namedAt([name]).still.texts
  expect(set.row).toBeLessThan(top - 8)
})

it('sets the caption below the ring where a panel covers the map above the spot', () => {
  const covered = [{ bottom: 400, left: 0, right: 1440, top: 0 }]
  expect(namedAt([], { covered }).moving.texts.every(({ down }) => down > 400)).toBe(true)
})
