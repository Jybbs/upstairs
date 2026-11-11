/**
 * The kilometers around the Earth at the equator.
 */
const EQUATOR = 40075.017

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

  set(width: number, height: number, zoom: number, longitude: number, latitude: number) {
    this.width   = width
    this.height  = height
    this.world   = 512 * 2 ** zoom
    this.centerX = xOf(longitude)
    this.centerY = yOf(latitude)
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
   * view, as the overlap of the stretches of the line within its columns and
   * within its rows.
   */
  crosses(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const dx = toX - fromX
    const dy = toY - fromY
    if (dx === 0 && (fromX < 0 || fromX > this.width)) return false
    if (dy === 0 && (fromY < 0 || fromY > this.height)) return false
    const left   = dx ? -fromX / dx : -Infinity
    const right  = dx ? (this.width - fromX) / dx : Infinity
    const top    = dy ? -fromY / dy : -Infinity
    const bottom = dy ? (this.height - fromY) / dy : Infinity
    const enter  = Math.max(0, Math.min(left, right), Math.min(top, bottom))
    const leave  = Math.min(1, Math.max(left, right), Math.max(top, bottom))
    return enter <= leave
  }
}
