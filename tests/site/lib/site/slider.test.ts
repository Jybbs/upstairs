// @vitest-environment happy-dom
import { mount }                   from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { Grip, HOVER_WAIT, Slider, useSlider } from '../../../../docs/.vitepress/lib/site/slider.ts'

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
      ...slider.grip.events,
      'aria-valuemax' : 19,
      'aria-valuemin' : 0,
      'aria-valuenow' : 7,
      'onKeydown'     : expect.any(Function),
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
    const go    = vi.fn()
    const grip  = new Grip(pick, go)
    const press = pointerAt(30)
    grip.press(press)
    expect((press.currentTarget as Element).setPointerCapture).toHaveBeenCalledWith(1)
    expect([go.mock.calls.at(-1), grip.gripped.value]).toEqual([[3], true])
    grip.move(pointerAt(70))
    expect(go).toHaveBeenLastCalledWith(7)
    grip.release()
    grip.move(pointerAt(120, 'touch'))
    vi.advanceTimersByTime(HOVER_WAIT)
    expect([go.mock.calls.length, grip.gripped.value]).toEqual([2, false])
  })

  it.each([
    ['waits out the hover intent before it moves', HOVER_WAIT - 1, 0],
    ['moves once a resting mouse has waited the hover intent', HOVER_WAIT, 1]
  ])('%s', (_, wait, moves) => {
    const go   = vi.fn()
    const grip = new Grip(pick, go)
    grip.move(pointerAt(40))
    vi.advanceTimersByTime(wait)
    expect(go.mock.calls).toEqual(Array.from({ length: moves }, () => [4]))
  })

  it('drops a waiting hover once the pointer leaves', () => {
    const go   = vi.fn()
    const grip = new Grip(pick, go)
    grip.move(pointerAt(40))
    grip.leave()
    vi.advanceTimersByTime(HOVER_WAIT)
    expect(go).not.toHaveBeenCalled()
  })

  it('ignores a press and a hover at a point that picks no index', () => {
    const go   = vi.fn()
    const grip = new Grip(pick, go)
    grip.press(pointerAt(-5))
    grip.move(pointerAt(-5))
    vi.advanceTimersByTime(HOVER_WAIT)
    expect([grip.gripped.value, go.mock.calls.length]).toEqual([false, 0])
  })
})

describe('the slider machine', () => {
  /**
   * Mounts a drawing driving a slider of 20 opening on `from`, focused so the
   * machine takes keys, beside its index and the count of its moves.
   */
  const mounted = async (from: number) => {
    const index   = ref(from)
    const moved   = vi.fn()
    const parts   = {} as { slider: ReturnType<typeof useSlider> }
    const wrapper = mount(defineComponent(() => {
      parts.slider = useSlider(20, index, x => Math.round(x / 10), moved)
      return () => h('svg', parts.slider.props.value)
    }), { attachTo: document.body })
    await wrapper.get('svg').trigger('focusin')
    return { index, moved, slider: parts.slider, svg: wrapper.get('svg'), wrapper }
  }

  it.each([
    ['ArrowRight', 5, 6],
    ['ArrowLeft', 5, 4],
    ['ArrowUp', 5, 6],
    ['ArrowDown', 5, 4],
    ['PageUp', 5, 7],
    ['PageDown', 5, 3],
    ['PageUp', 19, 19],
    ['Home', 5, 0],
    ['End', 5, 19],
    ['ArrowRight', 19, 19],
    ['ArrowLeft', 0, 0]
  ])('moves a slider of 20 on %s from %i to %i', async (key, from, to) => {
    const { index, svg, wrapper } = await mounted(from)
    await svg.trigger('keydown', { key })
    expect([index.value, svg.attributes('aria-valuenow')]).toEqual([to, String(to)])
    wrapper.unmount()
  })

  it('moves one index on a shifted arrow', async () => {
    const { index, svg, wrapper } = await mounted(5)
    await svg.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(index.value).toBe(6)
    wrapper.unmount()
  })

  it('reads as a slider over its run, leaving its name to the drawing', async () => {
    const { slider, svg, wrapper } = await mounted(5)
    const names                    = Object.keys(slider.props.value)
      .filter(key => key.startsWith('aria-label'))
    expect([svg.attributes('role'), svg.attributes('aria-valuemax'), names]).toEqual(['slider', '19', []])
    wrapper.unmount()
  })

  it.each([
    ['Home', 0],
    ['End', 19]
  ])('runs its callback on %s at the end it moves to', async (key, from) => {
    const { index, moved, svg, wrapper } = await mounted(from)
    await svg.trigger('keydown', { key })
    expect([index.value, moved.mock.calls.length]).toEqual([from, 1])
    wrapper.unmount()
  })

  it('runs its callback after every move, the index unchanged included', async () => {
    const { index, moved, slider, wrapper } = await mounted(19)
    slider.go(25)
    slider.go(3)
    await wrapper.vm.$nextTick()
    expect([index.value, moved.mock.calls.length]).toEqual([3, 2])
    wrapper.unmount()
  })
})
