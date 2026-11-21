/**
 * An outline on the miniature of the first screen, as its left edge, top edge,
 * width, and height on the miniature's grid.
 */
type Outline = readonly [x: number, y: number, width: number, height: number]

/**
 * A control of the first screen a section of the Guide opens on.
 */
export type Part = keyof typeof CONTROLS

/**
 * Each control in the order the Guide's sections describe it, with its figure's
 * caption, the outline it stands in on the miniature, which its figure raises,
 * and the heading of its section.
 */
export const CONTROLS = {
  map: {
    caption : 'The map around the spot, each satellite laying beads',
    outline : [40, 6, 240, 112],
    title   : 'The Map'
  },

  readout: {
    caption : 'The readout, its count and tally',
    outline : [48, 26, 66, 58],
    title   : 'The Readout'
  },

  spot: {
    caption : 'The search, Near me, and the spot chooser’s pin',
    outline : [50, 68, 62, 14],
    title   : 'Choosing the Spot'
  },

  strip: {
    caption : 'The time strip, a pin per pass',
    outline : [48, 96, 224, 16],
    title   : 'The Time Strip'
  },

  list: {
    caption : 'The pass list, one row per pass',
    outline : [46, 124, 228, 38],
    title   : 'The Pass List'
  }
} as const satisfies Record<string, { caption: string, outline: Outline, title: string }>
/**
 * The miniature's grid, as wide and tall as the first screen it draws.
 */
export const GRID = { height: 168, width: 320 } as const
/**
 * The smallest width a view into the miniature closes to, so a narrow control
 * keeps the screen around it in view.
 */
const NEAREST = 132
/**
 * The part of the miniature's grid the first screen covers, which a view into
 * it stays inside.
 */
export const SCREEN: Outline = [40, 0, 240, 168]
/**
 * The controls in the order the Guide's sections describe them.
 */
export const PARTS = Object.keys(CONTROLS) as Part[]

/**
 * Returns the fragment of the Guide's section on `part`, as VitePress writes
 * it from the section's heading.
 */
export const anchorOf = (part: Part) => `#${CONTROLS[part].title.toLowerCase().replaceAll(' ', '-')}`

/**
 * Returns the view of the miniature a figure opens from as it grows, the
 * control's outline padded by 10 on each side and widened to the grid's shape,
 * held inside the screen.
 */
export const viewOf = (part: Part): Outline => {
  const [x, y, width, height] = CONTROLS[part].outline

  const ratio = GRID.width / GRID.height
  const wide  = Math.min(SCREEN[2], Math.max(NEAREST, width + 20, (height + 20) * ratio))
  const tall  = wide / ratio
  const left  = Math.min(Math.max(x + width / 2 - wide / 2, SCREEN[0]), SCREEN[0] + SCREEN[2] - wide)
  const top   = Math.min(Math.max(y + height / 2 - tall / 2, 0), GRID.height - tall)
  return [left, top, wide, tall]
}

/**
 * Returns the transform that shows only `view` of a figure filling its frame,
 * which an animation eases to `none` to grow the figure out of that view.
 */
export const zoomOf = ([x, y, width]: Outline) =>
  `scale(${GRID.width / width}) translate(${-x / GRID.width * 100}%, ${-y / GRID.height * 100}%)`
