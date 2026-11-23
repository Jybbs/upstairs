import { describe, expect, it } from 'vitest'

import { openingOf, revealOf } from '../../../lib/site/reveal.ts'

describe('revealOf', () => {
  it.each([
    ['leaves a row already in full view', 96, 48, 48, 192, null],
    ['scrolls up to a row above the box', 48, 48, 96, 192, 48],
    ['scrolls down until a row below the box shows in full, on a row’s edge', 288, 48, 0, 200, 144],
    ['scrolls down to a row cut off at the box’s foot', 144, 48, 0, 160, 48]
  ])('%s', (_, top, height, scrolled, view, expected) =>
    expect(revealOf(top, height, scrolled, view)).toBe(expected))
})

describe('openingOf', () => {
  it.each([
    ['opens with the row at the top of the box', 96, 48, 400, 96],
    ['opens on the last row’s edge where the list runs out first', 480, 48, 410, 384]
  ])('%s', (_, top, height, most, expected) => expect(openingOf(top, height, most)).toBe(expected))
})
