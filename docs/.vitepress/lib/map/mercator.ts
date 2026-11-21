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
 * Whether the straight line from one pixel to another passes through `box`,
 * as the overlap of the stretches of the line within its columns and within
 * its rows.
 */
export const crossesBox = (box: Box, fromX: number, fromY: number, toX: number, toY: number): boolean => {
  const dx = toX - fromX
  const dy = toY - fromY
  if (dx === 0 && (fromX < box.left || fromX > box.right)) return false
  if (dy === 0 && (fromY < box.top || fromY > box.bottom)) return false
  const left   = dx ? (box.left - fromX) / dx : -Infinity
  const right  = dx ? (box.right - fromX) / dx : Infinity
  const top    = dy ? (box.top - fromY) / dy : -Infinity
  const bottom = dy ? (box.bottom - fromY) / dy : Infinity
  const enter  = Math.max(0, Math.min(left, right), Math.min(top, bottom))
  const leave  = Math.min(1, Math.max(left, right), Math.max(top, bottom))
  return enter <= leave
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
