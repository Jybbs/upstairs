/**
 * Fits the readout's tally, one tick per satellite on the map grouped by kind,
 * to the width it is given at any count.
 */

/**
 * A group of the fitted tally: the width its ticks span, the gap after it, and
 * how far its target reaches past its ticks on either side, in pixels.
 */
interface Group {
  gap   : number
  left  : number
  right : number
  width : number
}

type Layout = Record<keyof typeof TALLY, number>

/**
 * A fitted tally: each tick `tick` pixels wide at a pitch of `pitch`, and its
 * groups in the order the counts were given.
 */
export class Tally {
  constructor(readonly groups: Group[], readonly pitch: number, readonly tick: number) {}

  /**
   * The width the groups and the gaps between them span, in pixels.
   */
  get width() { return this.groups.reduce((sum, { gap, width }) => sum + gap + width, 0) }
}

/**
 * The tally's layout in pixels: the least gap between two groups, the widest
 * pitch and tick, the share of the pitch a tick takes, the least width a
 * group's target takes, and how many halving steps the search for the widest
 * pitch that fits takes.
 */
export const TALLY = { gap: 10, pitch: 9, share: 0.45, steps: 24, target: 24, tick: 4 } as const

/**
 * Lays out a tally of `counts` at `pitch`, its tick `layout.share` of the
 * pitch held between 1 px and `layout.tick`, and each gap widened until the
 * target of each group beside it is `layout.target` wide, the gap split
 * between the two groups by what each needs.
 */
const tallyAt = (counts: readonly number[], layout: Layout, pitch: number): Tally => {
  const tick    = Math.max(1, Math.min(layout.tick, pitch * layout.share))
  const spanOf  = (count: number) => Math.max(0, count * pitch - pitch + tick)
  const needOf  = (index: number) => Math.max(0, (layout.target - spanOf(counts[index])) / 2)
  const gapOf   = (index: number) => Math.max(layout.gap, needOf(index) + needOf(index + 1))
  const reachOf = (index: number, gap: number, other: number) => other < 0 || other >= counts.length
    ? Math.max(needOf(index), layout.gap / 2)
    : needOf(index) + (gap - needOf(index) - needOf(other)) / 2
  const groups  = counts.map((count, index) => {
    const after  = index < counts.length - 1 ? gapOf(index) : 0
    const before = index > 0 ? gapOf(index - 1) : 0
    return {
      gap   : after,
      left  : reachOf(index, before, index - 1),
      right : reachOf(index, after, index + 1),
      width : spanOf(count)
    }
  })
  return new Tally(groups, pitch, tick)
}

/**
 * Fits a tally of `counts`, one count per group shown, into `width` at the
 * widest pitch up to `layout.pitch` that fits.
 */
export const tallyOf = (counts: readonly number[], width: number, layout: Layout = TALLY): Tally => {
  const widest = tallyAt(counts, layout, layout.pitch)
  if (widest.width <= width) return widest
  let low  = 0
  let high = layout.pitch
  for (let step = 0; step < layout.steps; step++) {
    const middle = (low + high) / 2
    if (tallyAt(counts, layout, middle).width <= width) low = middle
    else high = middle
  }
  return tallyAt(counts, layout, low)
}
