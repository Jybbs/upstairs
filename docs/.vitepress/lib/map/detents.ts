/**
 * The wheel's detents in zoom levels: how far the wheel turns past a step
 * before leaving it, how near a step the zoom draws the map onto it, and the
 * wheel's pixels per zoom level.
 */
export const DETENT = { hold: 0.5, pull: 0.7, wheel: 220 } as const

/**
 * A camera the map can take, its center in degrees.
 */
export interface Step {
  latitude  : number
  longitude : number
  zoom      : number
}

/**
 * Where one turn of the wheel takes the camera: onto a step, about the pointer
 * to a zoom, or nowhere while a step holds it.
 */
type Turned = { step: Step } | { zoom: number } | null

/**
 * The detents of the chosen pass's steps, holding the camera at a step the
 * wheel reaches for `DETENT.hold` of a zoom level before letting it go on.
 */
export class Detents {
  steps: readonly Step[] = []

  private carried              = 0
  private holding: Step | null = null

  /**
   * Takes the chosen pass's steps, or none once no pass is chosen, letting go
   * of any step the camera held.
   */
  set(steps: readonly Step[]) {
    this.steps   = steps
    this.holding = null
  }

  /**
   * Returns where the wheel takes a camera at `zoom` turned by `delta` zoom
   * levels, stopping on the first step the turn crosses.
   */
  turn(zoom: number, delta: number): Turned {
    if (this.holding) {
      this.carried += delta
      if (Math.abs(this.carried) < DETENT.hold) return null
      delta        = this.carried - Math.sign(this.carried) * DETENT.hold
      this.holding = null
    }
    const to   = zoom + delta
    const step = this.nearest(zoom, each => (zoom - each.zoom) * (to - each.zoom) < 0)
    if (!step) return { zoom: to }
    this.holding = step
    this.carried = 0
    return { step }
  }

  /**
   * Returns the first step past `zoom` in the direction of `sign`, as Minus
   * and Plus take the camera, or null where no step stands that way, letting
   * go of the step the wheel holds at.
   */
  next(zoom: number, sign: 1 | -1): Step | null {
    this.holding = null
    return this.nearest(zoom, step => (step.zoom - zoom) * sign > 0.01)
  }

  /**
   * Returns the step nearest `zoom` within `DETENT.pull` of a zoom level,
   * beside the share of the way toward its center the map moves.
   */
  pullAt(zoom: number): { share: number, step: Step } | null {
    const step     = this.nearest(zoom)
    const distance = step ? Math.abs(zoom - step.zoom) / DETENT.pull : 1
    return step && distance < 1 ? { share: (1 - distance) ** 2, step } : null
  }

  /**
   * Returns the step nearest `zoom`, among those `keep` passes where it is
   * given, or null where none is left.
   */
  private nearest(zoom: number, keep?: (step: Step) => boolean) {
    const away = (step: Step) => Math.abs(step.zoom - zoom)
    return this.steps.reduce<Step | null>((near, step) =>
      (!keep || keep(step)) && (!near || away(step) < away(near)) ? step : near, null)
  }
}
