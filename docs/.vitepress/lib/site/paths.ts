/**
 * Writes the SVG path data the drawings stroke.
 */

/**
 * Returns a tick across the start of `points` and an arrowhead at its end
 * pointing the way the points run, as one path.
 */
export const endsOf = (points: readonly (readonly [number, number])[], size = 6) => {
  const [[x0, y0], [x1, y1]] = points
  const across               = Math.hypot(x1 - x0, y1 - y0) || 1
  const dx                   = size * (y1 - y0) / across
  const dy                   = size * (x1 - x0) / across
  const [a, b]               = [points.at(-3)!, points.at(-1)!]
  const back                 = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI
  const barb                 = (turn: number): [number, number] =>
    [b[0] + 1.5 * size * Math.cos(back + turn), b[1] + 1.5 * size * Math.sin(back + turn)]
  return pathOf([[x0 - dx, y0 + dy], [x0 + dx, y0 - dy]]) + pathOf([barb(0.45), b, barb(-0.45)])
}

/**
 * Returns a path through `points` in order, each coordinate to a tenth of a
 * pixel.
 */
export const pathOf = (points: readonly (readonly [number, number])[]) =>
  points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
