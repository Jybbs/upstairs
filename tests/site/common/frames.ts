import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { expect, onTestFinished, vi }     from 'vitest'

/**
 * Moves the case's clock onto Vitest's fake timers until it finishes, faking
 * only what `config` names where a case passes one.
 */
export const fakeClock = (config?: Parameters<typeof vi.useFakeTimers>[0]) => {
  vi.useFakeTimers(config)
  onTestFinished(() => {
    vi.useRealTimers()
  })
}

/**
 * Runs `count` frames on the fake clock, settling the promises each frame
 * leaves before the next.
 */
export const framesOf = async (count: number) => {
  for (let frame = 0; frame < count; frame++) {
    vi.advanceTimersToNextFrame()
    await flushPromises()
  }
}

/**
 * Runs the two frames and the timer an opened dialog takes before it listens
 * for Escape and for presses outside it.
 */
export const dialogListens = async () => {
  await framesOf(2)
  await vi.runOnlyPendingTimersAsync()
}

/**
 * Unmounts `wrapper` once the case finishes, then runs the two frames a
 * dialog's layer takes to leave the shared layer stack and checks the wrapper
 * left the document. A case calls it after `fakeClock`, because the hooks of a
 * case run in reverse order and the frames run on the fake clock.
 */
export const unmountOnFinish = (wrapper: VueWrapper) => {
  onTestFinished(async () => {
    wrapper.unmount()
    await framesOf(2)
    expect(document.body).not.toContain(wrapper.element)
  })
}
