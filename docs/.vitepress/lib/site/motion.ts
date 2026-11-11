/**
 * Moves a drawing's parts between frames, each part a critically damped spring
 * advanced in fixed steps so its motion reads the same at every frame rate.
 */

/**
 * Seconds each step of a spring's integration covers.
 */
const TICK = 0.004

/**
 * Returns `value` held between `low` and `high`.
 */
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

export class Spring {
  position = 0
  velocity = 0

  /**
   * Advances the spring `dt` seconds toward `to` at `rate` radians per second,
   * returning whether it still moves.
   */
  advance(to: number, rate: number, dt: number) {
    for (let left = dt; left > 0; left -= TICK) {
      const step = Math.min(TICK, left)
      this.velocity += (rate * rate * (to - this.position) - 2 * rate * this.velocity) * step
      this.position += this.velocity * step
    }
    return Math.abs(to - this.position) > 0.003 || Math.abs(this.velocity) > 0.03
  }

  /**
   * Stops the spring at `position`.
   */
  rest(position: number) {
    this.position = position
    this.velocity = 0
  }
}
