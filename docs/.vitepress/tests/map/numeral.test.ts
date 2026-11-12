import { expect, it } from 'vitest'

import { NUMERAL, slotsOf } from '../../lib/map/numeral.ts'

it('spaces the points on a staggered grid so the count just covers the shape, ordered from the left', () => {
  const slots = slotsOf(200, 100, 100, () => true)
  expect(Math.abs(slots.length - 200)).toBeLessThan(20)
  expect(slots.map(([x]) => x)).toEqual(slots.map(([x]) => x).toSorted((a, b) => a - b))
})

it('keeps only the points inside the shape', () =>
  expect(slotsOf(50, 100, 100, x => x < 50).every(([x]) => x < 50)).toBe(true))

it(`keeps ${NUMERAL.least} px between points however many the shape is asked to hold`, () => {
  const [[x, y], [u, v]] = slotsOf(10_000, 4, 20, () => true)
  expect(Math.hypot(u - x, v - y)).toBe(NUMERAL.least)
})
