// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { expect, it, vi }         from 'vitest'

import { passOf }               from '../fixtures/passes.ts'
import { addScanned, freshSky } from '../fixtures/sky.ts'

/**
 * Mounts the time strip over a fresh copy of the shared state and a stand-in
 * worker, with `passes` in the sky, the device asking for reduced motion where
 * `reduced` is set and being a phone where `phone` is.
 */
const mounted = async (reduced: boolean, phone = false, passes = [passOf(1)]) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener() {},
    matches: reduced && query.includes('reduce') || phone && query.includes('40rem'),
    removeEventListener() {}
  }))
  const { component: TimeStrip, sky } = await freshSky(() => import('../../theme/TimeStrip.vue'))
  const [pass]                        = passes
  addScanned(sky, passes)
  sky.scope.value = 'sky'
  const wrapper   = mount(TimeStrip, { attachTo: document.body })
  await wrapper.vm.$nextTick()
  return { pass, passes, sky, wrapper }
}

/**
 * Three passes peaking at 10, 20, and 30 minutes, the middle one the highest.
 */
const THREE = [
  passOf(1),
  passOf(2, { key: '2/900', peak: 80, peakAt: 1200, riseAt: 900, setAt: 1500 }),
  passOf(3, { key: '3/1500', peak: 30, peakAt: 1800, riseAt: 1500, setAt: 2100 })
]

/**
 * Returns the place in time order of each ridge the strip draws, from the back
 * to the front, read from where its peak stands across the strip.
 */
const stackOf = (wrapper: VueWrapper) => {
  const peaks = wrapper.findAll('g.cursor-pointer').map(ridge => Number(ridge.get('circle').attributes('cx')))
  const order = peaks.toSorted((a, b) => a - b)
  return peaks.map(x => order.indexOf(x))
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
  ['holds the pass whose ridge the pointer rests on', 'pointerenter', 'held'],
  ['pins the pass whose ridge a pointer presses', 'pointerdown', 'pinned']
] as const)('%s', async (_, event, field) => {
  const { pass, sky, wrapper } = await mounted(false)
  await wrapper.get('g.cursor-pointer').trigger(event)
  expect(sky[field].value).toBe(pass)
})

it('picks on a phone the pass in the column a tap lands on', async () => {
  const { pass, sky, wrapper } = await mounted(false, true)
  const strip                  = wrapper.get('svg[role="slider"]')
  Object.assign(strip.element, { setPointerCapture() {} })
  await strip.trigger('pointerdown', { clientX: 100, clientY: 40 })
  await strip.trigger('pointerup', { clientX: 100, clientY: 40 })
  expect(sky.pinned.value).toBe(pass)
})

it('draws each pass as a ridge with its outline, its crest, and its peak, and no stem', async () => {
  const { wrapper } = await mounted(false)
  const ridge       = wrapper.get('g.cursor-pointer')
  expect([ridge.findAll('path').length, ridge.findAll('circle').length, ridge.findAll('line').length])
    .toEqual([3, 1, 0])
})

it.each([
  ['stacks the lower ridges in front of the higher', null, [1, 0, 2]],
  ['raises the held ridge above the rest', 0, [1, 2, 0]]
] as const)('%s', async (_, held, expected) => {
  const { passes, sky, wrapper } = await mounted(false, false, THREE)
  sky.held.value                 = held === null ? null : passes[held]
  await wrapper.vm.$nextTick()
  expect(stackOf(wrapper)).toEqual(expected)
})

it.each([
  ['raises the first ridge to peak after the time read', ['ArrowUp'], 0],
  ['raises the next ridge on', ['ArrowUp', 'ArrowUp'], 1],
  ['stops at the last ridge', ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp'], 2],
  ['raises the ridge before', ['ArrowUp', 'ArrowUp', 'ArrowDown'], 0]
] as const)('%s', async (_, keys, raised) => {
  const { passes, sky, wrapper } = await mounted(false, false, THREE)
  const strip                    = wrapper.get('svg[role="slider"]')
  for (const key of keys) await strip.trigger('keydown', { key })
  expect(sky.held.value).toBe(passes[raised])
})

it('raises nothing before the first ridge when no ridge peaks earlier', async () => {
  const { sky, wrapper } = await mounted(false, false, THREE)
  await wrapper.get('svg[role="slider"]').trigger('keydown', { key: 'ArrowDown' })
  expect(sky.held.value).toBeNull()
})

it('chooses the raised ridge on Enter', async () => {
  const { passes, sky, wrapper } = await mounted(false, false, THREE)
  const strip                    = wrapper.get('svg[role="slider"]')
  await strip.trigger('keydown', { key: 'ArrowUp' })
  await strip.trigger('keydown', { key: 'Enter' })
  expect(sky.pinned.value).toBe(passes[0])
})

it.each(['blur', 'pointercancel'] as const)('lets the raised ridge fall on %s', async event => {
  const { sky, wrapper } = await mounted(false, false, THREE)
  const strip            = wrapper.get('svg[role="slider"]')
  await strip.trigger('keydown', { key: 'ArrowUp' })
  await strip.trigger(event)
  expect(sky.held.value).toBeNull()
})

it('raises on a phone the ridge in the column a finger holds', async () => {
  const { pass, sky, wrapper } = await mounted(false, true)
  const strip                  = wrapper.get('svg[role="slider"]')
  Object.assign(strip.element, { setPointerCapture() {} })
  await strip.trigger('pointerdown', { clientX: 100, clientY: 40 })
  expect(sky.held.value).toBe(pass)
})
