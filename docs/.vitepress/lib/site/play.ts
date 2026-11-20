import {
  useEventListener,
  useIntersectionObserver,
  useIntervalFn,
  usePreferredReducedMotion
} from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'

/**
 * Plays a drawing once `frame` first stands mostly in view, moving it through
 * `steps` in turn, `every` milliseconds apart, until the last step or until
 * the reader presses or types on the drawing. A device set to reduce motion
 * plays nothing, leaving the drawing where it opened.
 *
 * Args:
 *   frame : The drawing's element, left empty until the drawing has its values.
 *   every : The milliseconds between two steps.
 *   go    : Moves the drawing to a step.
 *   steps : Reads the steps to play through once the drawing comes into view.
 */
export const usePlay = (
  frame : MaybeRefOrGetter<HTMLElement | null | undefined>,
  every : number,
  go    : (step: number) => void,
  steps : () => Iterable<number>
) => {
  const motion                = usePreferredReducedMotion()
  let queue: Iterator<number> = [].values()
  const play = useIntervalFn(() => {
    const step = queue.next()
    if (step.done) play.pause()
    else go(step.value)
  }, every, { immediate: false })
  const seen = useIntersectionObserver(frame, ([entry]) => {
    if (!entry?.isIntersecting) return
    seen.stop()
    if (motion.value === 'reduce') return
    queue = steps()[Symbol.iterator]()
    play.resume()
  }, { threshold: 0.6 })
  useEventListener(frame, ['keydown', 'pointerdown'], play.pause)
}
