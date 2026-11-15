/**
 * Makes a drawing the control of a slider over a run of indices, per the APG
 * slider pattern, so a press or a drag moves to the index under the pointer, a
 * mouse resting on the drawing moves there after the hover wait, and the
 * arrow, Page, Home, and End keys step through the indices.
 *
 * `useSlider` runs the value and the slider's attributes on Zag's slider
 * machine, its keys on the steps below and its pointer on a `Grip`, whereas
 * `Slider` runs the whole pattern itself for a drawing whose pointer picks by a
 * rule of its own.
 */

import * as slider                                from '@zag-js/slider'
import { normalizeProps, useMachine }             from '@zag-js/vue'
import { computed, onBeforeUnmount, ref, useId, type Ref } from 'vue'

import { clamp } from './motion.ts'

/**
 * Reads the index under a point given in pixels from the drawing's top left,
 * or `null` where the point picks none.
 */
type Picker = (x: number, y: number) => number | null

/**
 * Milliseconds a resting mouse waits before it moves the slider.
 */
export const HOVER_WAIT = 200

/**
 * Reads the index `key` moves a slider over `count` indices to from `at`, one
 * along for an arrow, a tenth of the run for a Page key, and either end for
 * Home and End, or `undefined` for any other key.
 */
const targetOf = (key: string, at: number, count: number) => {
  const big                                    = Math.max(1, Math.round(count / 10))
  const steps: Partial<Record<string, number>> = {
    ArrowDown  : at - 1,
    ArrowLeft  : at - 1,
    ArrowRight : at + 1,
    ArrowUp    : at + 1,
    End        : count - 1,
    Home       : 0,
    PageDown   : at - big,
    PageUp     : at + big
  }
  return steps[key]
}

/**
 * Moves a slider to the index under the pointer, at once for a press or a
 * drag and after the hover wait for a resting mouse.
 */
export class Grip {
  /**
   * Whether a pointer holds the slider.
   */
  readonly gripped = ref(false)
  private wait     = 0

  /**
   * The listeners a drawing binds to drive the slider.
   */
  readonly events = {
    onPointercancel : () => this.release(),
    onPointerdown   : (event: PointerEvent) => this.press(event),
    onPointerleave  : () => this.leave(),
    onPointermove   : (event: PointerEvent) => this.move(event),
    onPointerup     : () => this.release()
  }

  /**
   * Args:
   *   pick : Reads the index under a point.
   *   go   : Moves the slider to an index.
   */
  constructor(private readonly pick: Picker, private readonly go: (index: number) => void) {}

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

export class Slider {
  readonly grip
  readonly index

  /**
   * Args:
   *   count   : The number of indices.
   *   initial : The index the slider opens on.
   *   pick    : Reads the index under a point.
   */
  constructor(readonly count: number, initial: number, pick: Picker) {
    this.index = ref(initial)
    this.grip  = new Grip(pick, next => this.go(next))
  }

  /**
   * The slider role, the range and value attributes, and the listeners a
   * drawing binds, read in the render that binds them.
   */
  get attributes() {
    return {
      ...this.grip.events,
      'aria-valuemax' : Math.max(0, this.count - 1),
      'aria-valuemin' : 0,
      'aria-valuenow' : this.index.value,
      'onKeydown'     : (event: KeyboardEvent) => this.key(event),
      'role'          : 'slider',
      'tabindex'      : 0
    }
  }

  /**
   * Moves to the index nearest `next`, held within the run.
   */
  go(next: number) { this.index.value = clamp(Math.round(next), 0, this.count - 1) }

  key(event: KeyboardEvent) {
    const next = targetOf(event.key, this.index.value, this.count)
    if (next === undefined) return
    event.preventDefault()
    this.go(next)
  }
}

/**
 * Runs Zag's slider machine over the indices below `count`, standing at
 * `index`, with a `Grip` moving it to the index `pick` reads under the
 * pointer.
 *
 * `moved` runs after every move, the index unchanged included, and `go`
 * moves to the index nearest a value. An arrow moves one index, a Page key a
 * tenth of the run from the index the slider stands at, and Home and End to
 * either end. The props returned spread onto the drawing, leaving out the
 * thumb's own label, position, and pointer handling, since the drawing is the
 * thumb and names itself.
 */
export const useSlider = (count: number, index: Ref<number>, pick: Picker, moved = () => {}) => {
  const id      = useId()
  const service = useMachine(slider.machine, computed(() => ({
    id             : id,
    max            : Math.max(0, count - 1),
    min            : 0,
    thumbAlignment : 'center' as const,
    value          : [index.value],
    onValueChange  : ({ value }: slider.ValueChangeDetails) => {
      index.value = value[0]
      moved()
    }
  })))
  const api = computed(() => slider.connect(service, normalizeProps))
  const go  = (next: number) => {
    const held = clamp(Math.round(next), 0, count - 1)
    if (held === index.value) moved()
    else api.value.setValue([held])
  }
  const nudge = (event: KeyboardEvent) => {
    const next = targetOf(event.key, index.value, count)
    if (next === undefined) return
    event.preventDefault()
    go(next)
  }
  const grip = new Grip(pick, go)
  onBeforeUnmount(() => grip.leave())
  return {
    go    : go,
    grip  : grip,
    props : computed(() => {
      const {
        'aria-label'      : _label,
        'aria-labelledby' : _labelledby,
        style             : _style,
        ...thumb
      } = api.value.getThumbProps({ index: 0 })
      return { ...thumb, onKeydown: nudge, ...grip.events }
    })
  }
}
