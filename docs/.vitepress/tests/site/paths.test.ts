import { describe, expect, it } from 'vitest'

import { endsOf, pathOf } from '../../lib/site/paths.ts'

describe('a path through points', () => {
  it('moves to the first point and draws a line to each after it, to a tenth of a pixel', () => {
    expect(pathOf([[0, 0], [10.04, 5], [20, 7.55]])).toBe('M0.0 0.0L10.0 5.0L20.0 7.5')
  })
})

describe('the ends of a path', () => {
  it('ticks across the start and points an arrowhead along the last stretch', () => {
    expect(endsOf([[0, 0], [10, 0], [20, 0]], 4)).toBe(
      pathOf([[0, 4], [0, -4]]) + pathOf([[20 - 6 * Math.cos(0.45), -6 * Math.sin(0.45)], [20, 0],
        [20 - 6 * Math.cos(0.45), 6 * Math.sin(0.45)]]))
  })
})
