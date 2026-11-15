// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'

import { NUMERAL, numeralIn, slotsOf, type Room } from '../../lib/map/numeral.ts'

/**
 * Sets the numeral through a stand-in canvas that measures it 200 pixels wide
 * and 70 tall and reads every pixel of its left half at an alpha of `left` and
 * of its right half at `right`, returning the size the canvas was given beside
 * the points `count` satellites take inside the numeral over `room`.
 */
const setIn = (count: number, room: Room, left = 255, right = 255) => {
  const canvas  = { height: 0, width: 0 }
  const context = {
    canvas       : canvas,
    fillText     : () => {},
    font         : '',
    measureText  : () => ({ actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 0, width: 200 }),
    setTransform : () => {},
    getImageData : (_x: number, _y: number, width: number, height: number) => ({
      data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, index) =>
        index % (width * 4) < width * 2 ? left : right)
    })
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const points = numeralIn(room, count)
  return { points, size: [canvas.width, canvas.height] }
}

afterEach(() => vi.restoreAllMocks())

it('spaces the points on a staggered grid so the count just covers the shape, ordered from the left', () => {
  const slots = slotsOf(200, 100, 100, () => true)
  expect(Math.abs(slots.length - 200)).toBeLessThan(20)
  const xs    = slots.map(([x]) => x)
  expect(xs).toEqual(xs.toSorted((a, b) => a - b))
})

it('keeps only the points inside the shape', () =>
  expect(slotsOf(50, 100, 100, x => x < 50).every(([x]) => x < 50)).toBe(true))

it(`keeps ${NUMERAL.least} px between points however many the shape is asked to hold`, () => {
  const [[x, y], [u, v]] = slotsOf(10_000, 4, 20, () => true)
  expect(Math.hypot(u - x, v - y)).toBe(NUMERAL.least)
})

it.each([
  ['as tall as 90% of a room wider than the numeral allows', { height: 200, left: 40, top: 30, width: 1000 },
    [515, 180], [282.5, 40]],
  ['as wide as 90% of a room taller than the numeral allows', { height: 1000, left: 40, top: 30, width: 300 },
    [270, 95], [55, 482.5]]
])('sets the numeral %s, centered in the room', (_, room, size, corner) => {
  const set          = setIn(300, room)
  const [left, top]  = corner
  const [xs, ys]     = [set.points.map(([x]) => x), set.points.map(([, y]) => y)]
  expect(set.size).toEqual(size)
  expect([Math.min(...xs) >= left, Math.max(...xs) <= left + size[0]]).toEqual([true, true])
  expect([Math.min(...ys) >= top, Math.max(...ys) <= top + size[1]]).toEqual([true, true])
})

it.each([
  ['keeps the points on pixels at an alpha of 128', 128, true],
  ['passes over the points on pixels at an alpha of 127', 127, false]
])('%s', (_, alpha, kept) => {
  const { points } = setIn(300, { height: 200, left: 0, top: 0, width: 1000 }, alpha, 0)
  const half       = 500
  expect([points.some(([x]) => x < half), points.some(([x]) => x >= half)]).toEqual([kept, false])
})
