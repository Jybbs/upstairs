import { expect, it, vi } from 'vitest'

import { BEADS, fadeOf, nearnessOf, openOf, Overlay } from '../../lib/map/overlay.ts'
import { DAY }                                         from '../../lib/orbit/catalog.ts'
import { kindOrder, type Kind }                        from '../../lib/orbit/kinds.ts'
import { iconOf }                                      from '../../lib/site/icons.ts'
import { SCHEMES }                                     from '../../lib/site/palette.ts'
import { TRACK_WIDTH }          from '../../lib/orbit/scan.ts'
import { Tracks }               from '../../lib/state/tracks.ts'
import { passOf }               from '../fixtures/passes.ts'

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
    canvas      : { height: 0, width: 0 },
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
  const context = new Proxy<Record<string | symbol, unknown>>(calls, {
    get: (target, key) => target[key] ?? (() => {})
  })
  const canvas  = { getContext: () => context } as unknown as HTMLCanvasElement
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
  ['dims each kind but the one the tally names', false],
  ['dims each traced kind but the one the tally names, its beads included', true]
])('%s', (_, traced) => {
  const plain = pairAt(7, null, traced).moving.alphas
  const named = pairAt(7, 'earth', traced).moving.alphas
  expect(named.map((alpha, index) => alpha / plain[index]))
    .toEqual(plain.map((_, index) => expect.closeTo(index < plain.length / 2 ? 0.16 : 1)))
})

it('draws a satellite the filters leave out at half strength with no beads', () => {
  const traced = pairAt(7, null, true).moving.alphas
  const left   = pairAt(7, null, false).moving.alphas
  expect([left.length, traced.length, left[1] / traced[2]]).toEqual([4, 6, expect.closeTo(0.5)])
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
  expect([beads.length, gaps.every(gap => gap >= BEADS.gap && gap < 2 * BEADS.gap)])
    .toEqual([BEADS.count, true])
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
  tracks.add([passOf(25544, { riseAt: 0, setAt: 60 }), passOf(43013, { riseAt: 0, setAt: 60 })],
    track, Uint32Array.of(0, 3 * TRACK_WIDTH), 3)
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
    canvas    : { height: 0, width: 0 },
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
  const context = new Proxy<Record<string | symbol, unknown>>(calls, {
    get: (target, key) => target[key] ?? (() => {})
  })
  return { canvas: { getContext: () => context } as unknown as HTMLCanvasElement, marks, ribbons }
}

/**
 * Draws one satellite crossing the view eastward at `elevation` degrees,
 * through a pass `changes` sets, chosen or held as `as` names, at `seconds`
 * into the window.
 */
const drawnAt = (
  seconds   : number,
  elevation : number,
  as        : 'held' | 'none' | 'selected',
  changes   = {}
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
    traced   : () => true,
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
