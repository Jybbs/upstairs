/**
 * Makes a drawing the control of a slider over a run of indices, per the APG
 * slider pattern, so a press or a drag moves to the index under the pointer, a
 * mouse resting on the drawing moves there after the hover wait, and the
 * arrow, Page, Home, and End keys step through the indices.
 */

import { ref } from 'vue'

import { clamp } from './motion.ts'

/**
 * Milliseconds a resting mouse waits before it moves the slider.
 */
export const HOVER_WAIT = 200

export class Slider {
  /**
   * Whether a pointer holds the slider.
   */
  readonly gripped = ref(false)
  readonly index
  private wait     = 0

  /**
   * The listeners a drawing binds to drive the slider.
   */
  readonly events = {
    keydown       : (event: KeyboardEvent) => this.key(event),
    pointercancel : () => this.release(),
    pointerdown   : (event: PointerEvent) => this.press(event),
    pointerleave  : () => this.leave(),
    pointermove   : (event: PointerEvent) => this.move(event),
    pointerup     : () => this.release()
  }

  /**
   * Args:
   *   count   : The number of indices.
   *   initial : The index the slider opens on.
   *   pick    : Returns the index under a point given in pixels from the
   *     drawing's top left, or `null` where the point picks none.
   *   moved   : Runs after every move, the index unchanged included.
   */
  constructor(
    readonly count         : number,
    initial                : number,
    private readonly pick  : (x: number, y: number) => number | null,
    private readonly moved : () => void = () => {}
  ) {
    this.index = ref(initial)
  }

  /**
   * The slider role and the range and value attributes a drawing binds, read
   * in the render that binds them.
   */
  get attributes() {
    return {
      'aria-valuemax' : Math.max(0, this.count - 1),
      'aria-valuemin' : 0,
      'aria-valuenow' : this.index.value,
      'role'          : 'slider',
      'tabindex'      : 0
    }
  }

  /**
   * Moves to the index nearest `next`, held within the run.
   */
  go(next: number) {
    this.index.value = clamp(Math.round(next), 0, this.count - 1)
    this.moved()
  }

  key(event: KeyboardEvent) {
    const big                                    = Math.max(1, Math.round(this.count / 10))
    const steps: Partial<Record<string, number>> = {
      ArrowDown  : -1,
      ArrowLeft  : -1,
      ArrowRight : 1,
      ArrowUp    : 1,
      PageDown   : -big,
      PageUp     : big
    }
    const step = steps[event.key]
    if (step !== undefined) this.go(this.index.value + step)
    else if (event.key === 'Home') this.go(0)
    else if (event.key === 'End') this.go(this.count - 1)
    else return
    event.preventDefault()
  }

  leave() { clearTimeout(this.wait) }

  move(event: PointerEvent) {
    clearTimeout(this.wait)
    const found = this.at(event)
    if (found === null) return
    if (this.gripped.value) this.go(found)
    else if (event.pointerType === 'mouse') this.wait = window.setTimeout(() => this.go(found), HOVER_WAIT)
  }

  press(event: PointerEvent) {
    const found = this.at(event)
    if (found === null) return
    const target = event.currentTarget as Element
    target.setPointerCapture(event.pointerId)
    this.gripped.value = true
    this.go(found)
  }

  release() { this.gripped.value = false }

  private at(event: PointerEvent) {
    const box = (event.currentTarget as Element).getBoundingClientRect()
    return this.pick(event.clientX - box.left, event.clientY - box.top)
  }
}
