// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HOVER_WAIT, Slider } from '../../lib/site/slider.ts'

const keyOf = (key: string) => ({ key, preventDefault: vi.fn() }) as unknown as KeyboardEvent

/**
 * Builds a pointer event `x` pixels from the left of a drawing whose left edge
 * stands at 100, from a pointer of `type`.
 */
const pointerAt = (x: number, type = 'mouse') => ({
  clientX       : 100 + x,
  clientY       : 0,
  currentTarget : { getBoundingClientRect: () => ({ left: 100, top: 0 }), setPointerCapture: vi.fn() },
  pointerId     : 1,
  pointerType   : type
}) as unknown as PointerEvent

describe('the attributes', () => {
  it('reads as a slider over its run, standing at its index', () => {
    const slider = new Slider(20, 5, () => null)
    slider.go(7)
    expect(slider.attributes).toEqual({
      'aria-valuemax' : 19,
      'aria-valuemin' : 0,
      'aria-valuenow' : 7,
      'role'          : 'slider',
      'tabindex'      : 0
    })
  })
})

describe('the keys', () => {
  it.each([
    ['ArrowRight', 5, 6],
    ['ArrowUp', 5, 6],
    ['ArrowLeft', 5, 4],
    ['ArrowDown', 5, 4],
    ['PageUp', 5, 7],
    ['PageDown', 5, 3],
    ['Home', 5, 0],
    ['End', 5, 19],
    ['ArrowRight', 19, 19],
    ['ArrowLeft', 0, 0]
  ])('moves a slider of 20 on %s from %i to %i', (key, from, to) => {
    const slider = new Slider(20, from, () => null)
    const event  = keyOf(key)
    slider.key(event)
    expect(slider.index.value).toBe(to)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('leaves any other key to the page', () => {
    const slider = new Slider(20, 5, () => null)
    const event  = keyOf('Tab')
    slider.key(event)
    expect(slider.index.value).toBe(5)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})

describe('the pointer', () => {
  const pick = (x: number) => x < 0 ? null : Math.round(x / 10)

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('moves to the index under a press and follows a drag until the release', () => {
    const slider = new Slider(20, 0, pick)
    const press  = pointerAt(30)
    slider.press(press)
    expect(press.currentTarget).toMatchObject({ setPointerCapture: expect.any(Function) })
    expect([slider.index.value, slider.gripped.value]).toEqual([3, true])
    slider.move(pointerAt(70))
    expect(slider.index.value).toBe(7)
    slider.release()
    slider.move(pointerAt(120, 'touch'))
    vi.advanceTimersByTime(HOVER_WAIT)
    expect([slider.index.value, slider.gripped.value]).toEqual([7, false])
  })

  it.each([
    ['waits out the hover intent before it moves', HOVER_WAIT - 1, 0],
    ['moves once a resting mouse has waited the hover intent', HOVER_WAIT, 4]
  ])('%s', (_, wait, index) => {
    const slider = new Slider(20, 0, pick)
    slider.move(pointerAt(40))
    vi.advanceTimersByTime(wait)
    expect(slider.index.value).toBe(index)
  })

  it('drops a waiting hover once the pointer leaves', () => {
    const slider = new Slider(20, 0, pick)
    slider.move(pointerAt(40))
    slider.leave()
    vi.advanceTimersByTime(HOVER_WAIT)
    expect(slider.index.value).toBe(0)
  })

  it('ignores a press and a hover at a point that picks no index', () => {
    const moved  = vi.fn()
    const slider = new Slider(20, 2, pick, moved)
    slider.press(pointerAt(-5))
    slider.move(pointerAt(-5))
    vi.advanceTimersByTime(HOVER_WAIT)
    expect([slider.index.value, slider.gripped.value, moved.mock.calls.length]).toEqual([2, false, 0])
  })

  it('runs its callback after every move, the index unchanged included', () => {
    const moved  = vi.fn()
    const slider = new Slider(20, 19, pick, moved)
    slider.go(25)
    expect([slider.index.value, moved.mock.calls.length]).toEqual([19, 1])
  })
})
