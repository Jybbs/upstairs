/**
 * A rectangle of the view in pixels.
 */
export interface Box {
  bottom : number
  left   : number
  right  : number
  top    : number
}

/**
 * The kilometers around the Earth at the equator.
 */
const EQUATOR = 40075.017

/**
 * Returns the box `halfWidth` pixels each side of `x` and `halfHeight` above
 * and below `y`.
 */
export const boxAround = (x: number, y: number, halfWidth: number, halfHeight: number): Box =>
  ({ bottom: y + halfHeight, left: x - halfWidth, right: x + halfWidth, top: y - halfHeight })

/**
 * Whether the straight line from one pixel to another passes through `box`.
 */
export const crossesBox = (box: Box, fromX: number, fromY: number, toX: number, toY: number): boolean =>
  enteringOf(box, 0, fromX, fromY, toX - fromX, toY - fromY) <= 1

/**
 * Returns how far along the ray from `x`, `y` by `dx`, `dy` it enters `box`
 * grown by `by` pixels, as the overlap of the stretches of the ray within its
 * columns and within its rows, or Infinity where it never does.
 */
export const enteringOf = (box: Box, by: number, x: number, y: number, dx: number, dy: number) => {
  const { bottom, left, right, top } = box
  if (dx === 0 && (x < left - by || x > right + by)) return Infinity
  if (dy === 0 && (y < top - by || y > bottom + by)) return Infinity
  const x1   = dx ? (left - by - x) / dx : -Infinity
  const x2   = dx ? (right + by - x) / dx : Infinity
  const y1   = dy ? (top - by - y) / dy : -Infinity
  const y2   = dy ? (bottom + by - y) / dy : Infinity
  const near = Math.max(0, Math.min(x1, x2), Math.min(y1, y2))
  return near <= Math.min(Math.max(x1, x2), Math.max(y1, y2)) ? near : Infinity
}

/**
 * Returns `box` moved out by `by` pixels on every side.
 */
export const grown = (box: Box, by: number): Box =>
  ({ bottom: box.bottom + by, left: box.left - by, right: box.right + by, top: box.top - by })

/**
 * Whether two boxes overlap.
 */
export const meets = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/**
 * Returns the share of the world's width at which a longitude falls.
 */
export const xOf = (longitude: number): number => (longitude + 180) / 360

/**
 * Returns the share of the world's height at which a latitude falls.
 */
export const yOf = (latitude: number): number => {
  const clamped = Math.max(Math.min(latitude, 85.05), -85.05)
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + clamped * Math.PI / 360)) / (2 * Math.PI)
}

/**
 * A north-up view of the map, which turns shares of the world into pixels with
 * no objects made along the way, since it runs for every satellite on every
 * frame.
 */
export class View {
  width   = 0
  height  = 0
  world   = 512
  centerX = 0.5
  centerY = 0.5
  /**
   * The view's own box in pixels, its right and bottom moved in place as the
   * view is set.
   */
  readonly bounds: Box = { bottom: 0, left: 0, right: 0, top: 0 }

  set(width: number, height: number, zoom: number, longitude: number, latitude: number) {
    this.width         = width
    this.height        = height
    this.bounds.right  = width
    this.bounds.bottom = height
    this.world         = 512 * 2 ** zoom
    this.centerX       = xOf(longitude)
    this.centerY       = yOf(latitude)
  }

  /**
   * Returns the pixel column of a longitude, on the copy of the world nearest
   * the center.
   */
  column(longitude: number): number {
    let share = xOf(longitude) - this.centerX
    if (share > 0.5) share -= 1
    else if (share < -0.5) share += 1
    return this.width / 2 + share * this.world
  }

  row(latitude: number): number {
    return this.height / 2 + (yOf(latitude) - this.centerY) * this.world
  }

  /**
   * Returns the pixels per kilometer on the ground at a latitude.
   */
  scale(latitude: number): number {
    return this.world / (EQUATOR * Math.cos(latitude * Math.PI / 180))
  }

  inside(x: number, y: number, margin = 0): boolean {
    return x >= -margin && y >= -margin && x <= this.width + margin && y <= this.height + margin
  }

  /**
   * Whether the straight line from one pixel to another passes through the
   * view.
   */
  crosses(fromX: number, fromY: number, toX: number, toY: number): boolean {
    return crossesBox(this.bounds, fromX, fromY, toX, toY)
  }
}
