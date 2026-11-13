/**
 * The travel in pixels before a press turns into a drag.
 */
const SLOP = 8

/**
 * Returns the way a press that went down at `x`, `y` has turned once it has
 * traveled `SLOP` pixels, across or along the page, or null before then.
 */
export const turnOf = (x: number, y: number, { clientX, clientY }: PointerEvent) => {
  const across = Math.abs(clientX - x)
  const along  = Math.abs(clientY - y)
  if (Math.max(across, along) < SLOP) return null
  return across > along ? 'across' : 'along'
}
