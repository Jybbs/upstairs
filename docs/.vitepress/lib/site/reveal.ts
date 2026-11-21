/**
 * Returns where a list of rows `height` px tall, scrolled `scrolled` px down a
 * box `view` px tall, scrolls to so the row whose top stands `top` px down the
 * list shows in full, on a row's edge, or null where it already shows.
 */
export const revealOf = (top: number, height: number, scrolled: number, view: number) => {
  if (top < scrolled) return top
  if (top + height <= scrolled + view) return null
  return Math.ceil((top + height - view) / height) * height
}

/**
 * Returns where that list opens scrolled to so the row at `top` stands first,
 * held to the last row's edge short of `most`, the farthest the box scrolls.
 */
export const openingOf = (top: number, height: number, most: number) =>
  Math.min(top, Math.floor(most / height) * height)
