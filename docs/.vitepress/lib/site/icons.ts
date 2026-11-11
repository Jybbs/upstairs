import ICONS         from './icons.json' with { type: 'json' }
import type { Kind } from '../orbit/kinds.ts'

/**
 * The units across the square grid every mark is drawn on.
 */
export const GRID = 16

/**
 * The name of each mark the set draws, meaning a kind of satellite, a
 * direction, rising and setting, or a control.
 */
export type IconName = Kind | Mark

/**
 * The name of each mark the set draws besides the kinds of satellite.
 */
type Mark = Exclude<keyof typeof ICONS, 'kinds'>

/**
 * The size in pixels from which a mark takes the drawing made with the broad
 * nib, the smaller sizes taking the one made with the small nib.
 */
const BROAD = 22

/**
 * Returns the outline of the mark `name` on its `GRID`-unit grid, drawn for a
 * mark `size` pixels across.
 */
export const iconOf = (name: IconName, size: number) => {
  const { big, small } = name in ICONS.kinds ? ICONS.kinds[name as Kind] : ICONS[name as Mark]
  return size >= BROAD ? big : small
}
