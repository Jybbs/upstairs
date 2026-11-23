// @vitest-environment happy-dom
import { flushPromises, mount }       from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h, ref }    from 'vue'

import { usePlay }                          from '../../../lib/site/play.ts'
import { fakeClock }                        from '../../common/frames.ts'
import { stubIntersection, stubMatchMedia } from '../../common/stubs.ts'

let view: ReturnType<typeof stubIntersection>

/**
 * Mounts a drawing playing `steps` every 100 ms, returning each step it took
 * beside the drawing.
 */
const played = async (steps = [2, 0, 1]) => {
  const taken: number[] = []
  const frame           = ref<HTMLElement>()
  const wrapper         = mount(defineComponent({
    setup: () => {
      usePlay(frame, 100, step => taken.push(step), () => steps)
      return () => h('svg', { ref: frame })
    }
  }), { attachTo: document.body })
  await flushPromises()
  return { taken, wrapper }
}

beforeEach(() => {
  fakeClock()
  stubMatchMedia(() => false)
  view = stubIntersection()
})

it('takes each step in turn once the drawing comes into view, then stops', async () => {
  const { taken } = await played()
  const idle      = vi.getTimerCount()
  await vi.advanceTimersByTimeAsync(500)
  view(false)
  await vi.advanceTimersByTimeAsync(500)
  view()
  await vi.advanceTimersByTimeAsync(1_000)
  expect([taken, vi.getTimerCount()]).toEqual([[2, 0, 1], idle])
})

it.each(['pointerdown', 'pointermove', 'keydown'])('stops at a %s on the drawing', async type => {
  const { taken, wrapper } = await played()
  view()
  await vi.advanceTimersByTimeAsync(150)
  await wrapper.get('svg').trigger(type)
  await vi.advanceTimersByTimeAsync(1_000)
  expect(taken).toEqual([2])
})

it('plays nothing on a device set to reduce motion', async () => {
  stubMatchMedia(() => true)
  const { taken } = await played()
  view()
  await vi.advanceTimersByTimeAsync(1_000)
  expect(taken).toEqual([])
})
