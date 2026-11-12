/**
 * The narrowest column in pixels a tap on the strip owns on a phone.
 */
const COLUMN = 44

/**
 * A stretch of the strip from `from` to `to` in pixels, holding the peaks
 * inside it in the order they peak.
 */
interface Column<T> { from: number, peaks: { item: T, x: number }[], to: number }

/**
 * Cuts the strip from its left edge to `right` into one column per peak, each
 * running halfway to its neighbors, then merges the narrowest with its nearer
 * neighbor until every column is at least `COLUMN` pixels wide.
 */
export const columnsOf = <T>(peaks: readonly { item: T, x: number }[], right: number) => {
  const sorted  = peaks.toSorted((a, b) => a.x - b.x)
  const columns = sorted.map((peak, index): Column<T> => ({
    from  : index ? (sorted[index - 1].x + peak.x) / 2 : 0,
    peaks : [peak],
    to    : index < sorted.length - 1 ? (peak.x + sorted[index + 1].x) / 2 : right
  }))
  const middle = (column: Column<T>) => column.peaks.reduce((sum, { x }) => sum + x, 0) / column.peaks.length
  while (columns.length > 1) {
    const widths = columns.map(({ from, to }) => to - from)
    const index  = widths.indexOf(Math.min(...widths))
    if (widths[index] >= COLUMN) break
    const here   = middle(columns[index])
    const before = index > 0 ? here - middle(columns[index - 1]) : Infinity
    const after  = index < columns.length - 1 ? middle(columns[index + 1]) - here : Infinity
    const into   = before <= after ? index - 1 : index
    const [a, b] = [columns[into], columns[into + 1]]
    columns.splice(into, 2, { from: a.from, peaks: [...a.peaks, ...b.peaks], to: b.to })
  }
  return columns
}

/**
 * Returns what a tap at `x` picks: the item of the column under it peaking
 * nearest `x`, or, once that is the item `picked`, the next nearest after it.
 */
export const pickAt = <T>(columns: readonly Column<T>[], x: number, picked: T | null): T | null => {
  const column = columns.find(({ to }) => x < to) ?? columns.at(-1)
  if (!column) return null
  const near  = column.peaks.toSorted((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x)).map(({ item }) => item)
  const index = near.indexOf(picked as T)
  return index < 0 ? near[0] : near[(index + 1) % near.length]
}
