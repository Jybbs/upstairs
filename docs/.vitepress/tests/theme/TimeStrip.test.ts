// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { TRACK_WIDTH } from '../../lib/orbit/scan.ts'
import { passOf }      from '../fixtures/passes.ts'
import { freshSky }    from '../fixtures/sky.ts'

/**
 * Mounts the time strip over a fresh copy of the shared state and a stand-in
 * worker, with one pass in the sky, the device asking for reduced motion where
 * `reduced` is set and being a phone where `phone` is.
 */
const mounted = async (reduced: boolean, phone = false) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener() {},
    matches: reduced && query.includes('reduce') || phone && query.includes('40rem'),
    removeEventListener() {}
  }))
  const { component: TimeStrip, sky } = await freshSky(() => import('../../theme/TimeStrip.vue'))
  const pass                          = passOf(1)
  sky.tracks.add([pass], new Float32Array(TRACK_WIDTH), Uint32Array.of(0), 1)
  sky.scope.value = 'sky'
  sky.version.value++
  const wrapper = mount(TimeStrip)
  await wrapper.vm.$nextTick()
  return { pass, sky, wrapper }
}

it.each([
  ['runs the fast-forward from the live clock', 'live', false,
    'Run the rest of the hour at 60 times real speed', 'lapse'],
  ['returns from the fast-forward to now', 'running', false, 'Back to now', 'now'],
  ['returns from a held moment to now', 'held', false, 'Back to now', 'now'],
  ['moves a held frame five minutes on under reduced motion', 'held', true,
    'Draw the sky 5 minutes on', undefined]
] as const)('labels the round button as it %s', async (_, clock, reduced, label, mark) => {
  const { sky, wrapper } = await mounted(reduced)
  sky.clock.value        = clock
  await wrapper.vm.$nextTick()
  const button = wrapper.get('button')
  expect([button.attributes('aria-label'), button.get('svg').attributes('data-icon')]).toEqual([label, mark])
})

it.each([
  ['holds the pass whose peak the pointer rests on', 'pointerenter', 'held'],
  ['pins the pass whose peak a pointer presses', 'pointerdown', 'pinned']
] as const)('%s', async (_, event, field) => {
  const { pass, sky, wrapper } = await mounted(false)
  await wrapper.get('g.cursor-pointer').trigger(event)
  expect(sky[field].value).toBe(pass)
})

it('picks on a phone the pass in the column a tap lands on', async () => {
  const { pass, sky, wrapper } = await mounted(false, true)
  const strip = wrapper.get('svg[role="slider"]')
  Object.assign(strip.element, { setPointerCapture() {} })
  await strip.trigger('pointerdown', { clientX: 100, clientY: 40 })
  await strip.trigger('pointerup', { clientX: 100, clientY: 40 })
  expect(sky.pinned.value).toBe(pass)
})
