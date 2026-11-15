import { describe, expect, it } from 'vitest'

import { columnsOf, pickAt } from '../../lib/site/columns.ts'

/**
 * Returns peaks named by letter at each of `xs`.
 */
const peaksAt = (...xs: number[]) => xs.map((x, index) => ({ item: 'abcdefgh'[index], x }))

describe('columnsOf', () => {
  it.each([
    ['runs each column halfway to its neighbors', [100, 200, 300],
      [[0, 150, 'a'], [150, 250, 'b'], [250, 400, 'c']]],
    ['merges a column narrower than 44 px with its nearer neighbor', [100, 120, 140, 300],
      [[0, 130, 'ab'], [130, 220, 'c'], [220, 400, 'd']]],
    ['merges until every column is at least 44 px wide', [100, 110, 120, 130],
      [[0, 115, 'ab'], [115, 400, 'cd']]],
    ['keeps a column exactly 44 px wide', [100, 144, 188, 300],
      [[0, 122, 'a'], [122, 166, 'b'], [166, 244, 'c'], [244, 400, 'd']]],
    ['merges a column 40 px wide with its nearer neighbor', [100, 140, 180, 300],
      [[0, 160, 'ab'], [160, 240, 'c'], [240, 400, 'd']]],
    ['keeps one column for one peak', [50], [[0, 400, 'a']]]
  ])('%s', (_, xs, expected) =>
    expect(columnsOf(peaksAt(...xs), 400).map(({ from, peaks, to }) =>
      [from, to, peaks.map(({ item }) => item).join('')])).toEqual(expected))
})

describe('pickAt', () => {
  const columns = columnsOf(peaksAt(100, 120, 140, 300), 400)

  it.each([
    ['picks the peak nearest the tap in its column', 118, null, 'b'],
    ['picks the next one close by on a second tap', 118, 'b', 'a'],
    ['comes back round to the first on a third', 118, 'a', 'b'],
    ['picks in the column under the tap', 390, 'b', 'd']
  ])('%s', (_, x, picked, expected) => expect(pickAt(columns, x, picked)).toBe(expected))

  it('picks nothing on a strip with no peaks', () => expect(pickAt([], 10, null)).toBeNull())
})
