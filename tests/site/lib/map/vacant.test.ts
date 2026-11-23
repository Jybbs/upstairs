import { beforeEach, expect, it, vi } from 'vitest'

import * as vacant    from '../../../../docs/.vitepress/lib/map/vacant.ts'
import { SCHEMES }    from '../../../../docs/.vitepress/lib/site/palette.ts'
import { canvasWith } from '../../common/stubs.ts'

const DIGITS: Record<string, string> = { '-----': '0', '....-': '4' }
const ROOM                           = { height: 300, left: 0, top: 0, width: 400 }

let built: number

beforeEach(() => {
  built = 0
  vi.stubGlobal('Path2D', class { constructor(readonly d = '') { built++ } })
})

/**
 * Reads Morse marks back into the words they key, a 4 px mark as a dot and a
 * 12 px one as a dash, a 12 px gap ending a letter and a 28 px gap a word.
 */
const decode = (keys: [number, number][]) => {
  let words  = ''
  let letter = ''
  for (const [index, [from, to]] of keys.entries()) {
    letter     += to - from === 4 ? '.' : '-'
    const after = (keys[index + 1]?.[0] ?? Infinity) - to
    if (after === 4) continue
    words  += DIGITS[letter] + (after === 28 ? ' ' : '')
    letter  = ''
  }
  return words.trim().split(' ')
}

/**
 * Builds the drawing over a context ignoring every call but `arc`,
 * `clearRect`, and `setLineDash`, recording the radius of each arc and each
 * dash set since the frame cleared, the first dash being the ring's.
 */
const drawingOf = () => {
  const radii: number[]    = []
  const dashes: number[][] = []
  const { canvas }         = canvasWith({
    arc         : (_x: number, _y: number, radius: number) => radii.push(radius),
    setLineDash : (segments: number[]) => dashes.push(segments),

    clearRect: () => {
      radii.length  = 0
      dashes.length = 0
    }
  })
  const sky = new vacant.VacantSky(canvas)
  sky.resize(400, 300, 1, ROOM)
  const state   = () => [dashes[0].length ? 'dashed' : 'solid', sky.crossed, radii.includes(6)]
  return { sky, state }
}

it('keys a line in Morse spelling 404 over and over in whole words', () => {
  expect(decode(vacant.keysAlong(432))).toEqual(['404', '404'])
})

it('keys only the marks that fit whole along a line', () => {
  expect(vacant.keysAlong(30)).toEqual([[0, 4], [8, 12], [16, 20], [24, 28]])
})

it.each([
  ['the whole frame where nothing covers it', [], 600],
  ['the frame above a strip across its foot', [{ bottom: 600, left: 0, right: 400, top: 520 }], 520],
  ['the frame where a panel stands beside it', [{ bottom: 600, left: 400, right: 800, top: 0 }], 600],
  ['the frame where a panel stands below it', [{ bottom: 900, left: 0, right: 400, top: 600 }], 600],
  ['nothing where a panel covers the whole frame', [{ bottom: 600, left: 0, right: 400, top: 0 }], 0]
])('leaves open %s', (_, covers, height) => {
  expect(vacant.roomOf({ bottom: 600, left: 0, right: 400, top: 0 }, ...covers))
    .toEqual({ height, left: 0, top: 0, width: 400 })
})

it('leaves open the frame’s own pixels where the frame stands below the bar', () => {
  const frame = { bottom: 664, left: 440, right: 840, top: 64 }
  expect(vacant.roomOf(frame, { bottom: 664, left: 0, right: 840, top: 584 }))
    .toEqual({ height: 520, left: 0, top: 0, width: 400 })
})

it('sets the ring inside its room, clear of every track', () => {
  const { sky }               = drawingOf()
  const { radius, x, y }      = sky.ring
  const nearest               = Math.min(...vacant.TRACKS.flatMap(track =>
    Array.from({ length: 401 }, (_, along) =>
      Math.hypot(along - x, vacant.heightOf(track, along / 400, 300) - y))))
  expect(radius).toBeGreaterThan(0)
  expect(nearest).toBeGreaterThan(radius)
  expect(Math.min(x - radius, y - radius, 400 - x - radius, 300 - y - radius)).toBeGreaterThan(0)
})

it.each([
  ['dashes the ring with no pass called, and draws no pass', (sky: vacant.VacantSky) => {
    sky.draw(1)
  }, ['dashed', false, false]],
  ['keeps the ring dashed while the called pass crosses toward the spot', (sky: vacant.VacantSky) => {
    sky.call(true)
    sky.draw(0.1)
  }, ['dashed', false, true]],
  ['draws the ring solid once the called pass reaches the spot', (sky: vacant.VacantSky) => {
    sky.call(true)
    sky.draw(4.2)
  }, ['solid', true, true]],
  ['dashes the ring again once the pass is let go', (sky: vacant.VacantSky) => {
    sky.call(true)
    sky.draw(4.2)
    sky.call(false)
    sky.draw(0)
  }, ['dashed', false, false]],
  ['stands the called pass at the spot at once under reduced motion', (sky: vacant.VacantSky) => {
    sky.reduced = true
    sky.call(true)
    sky.draw(0)
  }, ['solid', true, true]]
])('%s', (_, steps, expected) => {
  const { sky, state } = drawingOf()
  steps(sky)
  expect(state()).toEqual(expected)
})

it('draws no ring where its room leaves no space for one', () => {
  const dashes: number[][] = []
  const { canvas }         = canvasWith({ setLineDash: (segments: number[]) => dashes.push(segments) })
  const sky                = new vacant.VacantSky(canvas)
  sky.resize(400, 300, 1, { ...ROOM, height: 0 })
  sky.draw(1)
  expect([sky.ring.radius, dashes]).toEqual([0, []])
})

it('builds no path while it draws a frame', () => {
  const { sky } = drawingOf()
  sky.call(true)
  const before  = built
  sky.draw(1)
  sky.draw(1)
  expect(built).toBe(before)
})

it('keys the length of the navigation track in Morse, a disc per dot and a line per dash', () => {
  const track            = vacant.TRACKS.find(({ kind }) => kind === 'navigation')!
  const { dashes, dots } = vacant.keyedOf(track, 400, 300)
  let length             = 0
  for (let x = 1; x <= 400; x++) {
    length += Math.hypot(1, vacant.heightOf(track, x / 400, 300) - vacant.heightOf(track, (x - 1) / 400, 300))
  }
  const marks = vacant.keysAlong(length)
  expect({ dashes: dashes.split('M').length - 1, dots: dots.split('M').length - 1 }).toEqual({
    dashes : marks.filter(([from, to]) => to - from > 4).length,
    dots   : marks.filter(([from, to]) => to - from === 4).length
  })
})

it.each([
  ['moves each satellite along its track as the clock runs', false, true],
  ['holds each satellite still under reduced motion', true, false]
])('%s', (_, reduced, moved) => {
  const centers: number[] = []
  const { canvas }        = canvasWith({
    arc: (x: number, y: number, radius: number) => { if (radius === 5) centers.push(x, y) },

    clearRect: () => { centers.length = 0 }
  })
  const sky   = new vacant.VacantSky(canvas)
  sky.reduced = reduced
  sky.resize(400, 300, 1, ROOM)
  sky.draw(0)
  const before = [...centers]
  sky.draw(10)
  expect(centers.some((at, index) => at !== before[index])).toBe(moved)
})

it('draws each track and its satellite in its kind’s color', () => {
  const fills: unknown[]    = []
  const strokes: unknown[]  = []
  const { canvas, context } = canvasWith({
    fill   : (path?: unknown) => { if (!path) fills.push(context.fillStyle) },
    stroke : (path?: unknown) => { if (path) strokes.push(context.strokeStyle) }
  })
  const sky    = new vacant.VacantSky(canvas)
  const colors = vacant.TRACKS.map(({ kind }) => SCHEMES.day.kinds[kind])
  sky.resize(400, 300, 1, ROOM)
  sky.draw(0)
  expect([strokes, fills]).toEqual([
    vacant.TRACKS.flatMap(({ kind }, index) =>
      kind === 'navigation' ? [colors[index], colors[index]] : [colors[index]]),
    [SCHEMES.day.halo, ...colors]
  ])
})
