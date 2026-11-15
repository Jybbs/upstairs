import { describe, expect, it } from 'vitest'

import { TALLY, tallyOf } from '../../lib/site/tally.ts'

const WIDTH  = 326
const COUNTS = [
  ['one satellite', [1]],
  ['a few of each kind', [3, 1, 12, 2, 5]],
  ['a crowded map', [40, 3, 1, 900, 220, 12, 4, 30]],
  ['a lone kind of many', [4000]]
] as const

describe('the tally', () => {
  it.each(COUNTS)('fits %s inside the readout', (_, counts) => {
    expect(tallyOf(counts, WIDTH).width).toBeLessThanOrEqual(WIDTH)
  })

  it.each(COUNTS)('gives each group of %s a target at least 24 px wide', (_, counts) => {
    for (const { left, right, width } of tallyOf(counts, WIDTH).groups) {
      expect(left + width + right).toBeGreaterThanOrEqual(TALLY.target - 0.01)
    }
  })

  it('draws a few satellites at the widest pitch and tick', () => {
    expect(tallyOf([3, 2], WIDTH)).toMatchObject({ pitch: TALLY.pitch, tick: TALLY.tick })
  })

  it('narrows the pitch and keeps the tick at least 1 px once the count outgrows the width', () => {
    const { pitch, tick } = tallyOf([4000], WIDTH)
    expect(pitch).toBeLessThan(1)
    expect(tick).toBe(1)
  })

  it('spans one tick per satellite at the pitch, so the tally counts off mark by mark', () => {
    const { groups, pitch, tick } = tallyOf([5], WIDTH)
    expect(groups[0].width).toBeCloseTo(4 * pitch + tick)
  })

  it('leaves no gap after the last group', () => {
    expect(tallyOf([3, 4], WIDTH).groups.map(({ gap }) => gap > 0)).toEqual([true, false])
  })

  it('widens the gap between two single ticks until each target reaches 24 px', () => {
    const { groups } = tallyOf([1, 1], WIDTH)
    expect(groups[0].gap).toBeCloseTo(TALLY.target - TALLY.tick)
    expect(groups[0].right + groups[1].left).toBeCloseTo(groups[0].gap)
  })
})
