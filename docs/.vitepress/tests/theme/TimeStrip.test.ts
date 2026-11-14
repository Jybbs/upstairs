// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { expect, it, vi }         from 'vitest'
import { ref }                    from 'vue'

import { TRACK_WIDTH }          from '../../lib/orbit/scan.ts'
import { passOf }               from '../fixtures/passes.ts'
import { addScanned, freshSky } from '../fixtures/sky.ts'

/**
 * The width the strip measures, 800 px unless a case narrows it.
 */
const WIDTH = vi.hoisted(() => ({ value: 800 }))

vi.mock('@vueuse/core', async original => ({
  ...await original<typeof import('@vueuse/core')>(),
  useElementSize: () => ({ height: ref(0), width: ref(WIDTH.value) })
}))

/**
 * Three passes peaking at 10, 20, and 30 minutes, the middle one the highest.
 */
const THREE = [
  passOf(1),
  passOf(2, { key: '2/900', peak: 80, peakAt: 1200, riseAt: 900, setAt: 1500 }),
  passOf(3, { key: '3/1500', peak: 30, peakAt: 1800, riseAt: 1500, setAt: 2100 })
]

/**
 * Mounts the time strip over a fresh copy of the shared state and a stand-in
 * worker, with `passes` in the sky, the device asking for reduced motion where
 * `reduced` is set and being a phone where `phone` is.
 */
const mounted = async (reduced: boolean, phone = false, passes = [passOf(1)], width = 800) => {
  WIDTH.value = width
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

it('keeps a pinned ridge in its place among the rest, so each lower peak stays pressable', async () => {
  const { passes, sky, wrapper } = await mounted(false, false, THREE)
  sky.pin(passes[1])
  await wrapper.vm.$nextTick()
  const crests = wrapper.findAll('g.cursor-pointer g').map(crest => crest.attributes('stroke-width'))
  expect([stackOf(wrapper), crests]).toEqual([[1, 0, 2], ['2.5', '1.5', '1.5']])
})

it('raises each pass’s own ridge to its peak elevation', async () => {
  const { wrapper } = await mounted(false, false, THREE)
  const ridges      = wrapper.findAll('g.cursor-pointer')
  const peaks       = ridges.map(ridge => ridge.get('circle'))
    .map(peak => [Number(peak.attributes('cx')), Number(peak.attributes('cy')).toFixed(1)] as const)
    .toSorted(([a], [b]) => a - b)
    .map(([, y]) => y)
  expect([peaks, new Set(ridges.map(ridge => ridge.get('path').attributes('d'))).size])
    .toEqual([['34.0', '20.7', '54.0'], 3])
})

it('colors each ridge by its pass’s kind and dots the crest where it cannot be seen', async () => {
  const passes      = [passOf(1), passOf(2, { key: '2/900', kind: 'weather', peakAt: 1200, riseAt: 900, setAt: 1500 })]
  const { wrapper } = await mounted(false, false, passes)
  const ridges      = wrapper.findAll('g.cursor-pointer')
  expect(ridges.map(ridge => {
    const unseen = ridge.get('path[stroke-dasharray="1 3"]')
    return [ridge.attributes('style'), unseen.attributes('d')!.startsWith('M')]
  })).toEqual(passes.map(({ kind }) => [`--ridge: var(--kind-${kind});`, true]))
})

it('draws the crest solid where the satellite can be seen by eye', async () => {
  vi.doMock('../../lib/orbit/seen.ts', () => ({ seenAt: () => true }))
  const { component: TimeStrip, sky } = await freshSky(() => import('../../theme/TimeStrip.vue'))
  vi.doUnmock('../../lib/orbit/seen.ts')
  sky.tracks.add([passOf(1)], new Float32Array(TRACK_WIDTH * 2), new Uint32Array(1), 2)
  sky.version.value++
  sky.scope.value = 'sky'
  const wrapper   = mount(TimeStrip, { attachTo: document.body })
  await wrapper.vm.$nextTick()
  const [, seen, unseen] = wrapper.get('g.cursor-pointer').findAll('path')
  expect([seen.attributes('d')!.startsWith('M'), seen.attributes('stroke-dasharray'), unseen.attributes('d')])
    .toEqual([true, undefined, ''])
})

it('raises nothing on a phone as a pointer passes over a ridge', async () => {
  const { sky, wrapper } = await mounted(false, true)
  await wrapper.get('g.cursor-pointer').trigger('pointerenter')
  expect(sky.held.value).toBeNull()
})

it('lets the raised ridge fall once a finger drags across the strip', async () => {
  const { sky, wrapper } = await mounted(false, true)
  const strip            = wrapper.get('svg[role="slider"]')
  Object.assign(strip.element, { hasPointerCapture: () => true, setPointerCapture() {} })
  await strip.trigger('pointerdown', { clientX: 100, clientY: 40 })
  await strip.trigger('pointermove', { clientX: 160, clientY: 40 })
  expect(sky.held.value).toBeNull()
})

it('raises on a phone the same pass the tap that follows chooses, with a pass pinned', async () => {
  const passes           = [
    passOf(1, { peakAt: 20, riseAt: 0 }),
    passOf(2, { kind: 'weather', peakAt: 40, riseAt: 0 })
  ]
  const { sky, wrapper } = await mounted(false, true, passes)
  const strip            = wrapper.get('svg[role="slider"]')
  const x                = Number(wrapper.get('g.cursor-pointer circle').attributes('cx'))
  sky.pin(passes[0])
  Object.assign(strip.element, { setPointerCapture() {} })
  await strip.trigger('pointerdown', { clientX: x, clientY: 40 })
  const held = sky.held.value
  await strip.trigger('pointerup', { clientX: x, clientY: 40 })
  expect([held, sky.pinned.value]).toEqual([passes[1], passes[1]])
})

it.each([
  ['labels every tick on a strip wide enough for each', 800, [0, 1, 2, 3, 4, 5, 6]],
  ['labels every third tick on a phone, clear of the labels at either end', 322, [0, 3, 6]]
] as const)('%s', async (_, width, labeled) => {
  const { wrapper } = await mounted(false, false, [passOf(1)], width)
  const ticks       = wrapper.findAll('text.fill-soft')
  expect(ticks.flatMap((tick, index) => tick.text() ? [index] : [])).toEqual(labeled)
})
