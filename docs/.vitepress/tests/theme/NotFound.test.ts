// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi }       from 'vitest'
import { ref }                  from 'vue'

import { freshSky }   from '../common/sky.ts'
import { stubCanvas } from '../common/stubs.ts'

const BELOW   = { bottom: 900, left: 0, right: 400, top: 600 }
const MAP     = { bottom: 600, left: 0, right: 400, top: 0 }
const NUMERAL = '[aria-label="Gather the sky into 404"]'
const RING    = '[aria-label="Wait at the spot for a pass"]'

const page = vi.hoisted(() => ({
  frame   : (() => {}) as (moved: { delta: number }) => void,
  motion  : 'no-preference',
  resized : () => {},
  strip   : { bottom: 900, left: 0, right: 400, top: 600 }
}))

vi.mock('vitepress', async () => {
  const { h } = await import('vue')
  return {
    defineClientComponent : () => ({ setup: () => () => h('div', { 'data-map': '' }) }),
    useData               : () => ({ isDark: ref(false) })
  }
})

vi.mock('@vueuse/core', () => ({
  usePreferredReducedMotion : () => ref(page.motion),
  useRafFn                  : (frame: typeof page.frame) => {
    page.frame = frame
    return { pause: () => {}, resume: () => {} }
  },
  useResizeObserver         : (_: unknown, run: () => void) => { page.resized = run }
}))

/**
 * Mounts the not-found page over a fresh copy of the shared state and a
 * stand-in worker, its map 400 by 600 pixels with the panel below it and the
 * strip at `strip`, on a device reducing motion where `reduced` is set,
 * returning the messages the worker is posted.
 */
const mounted = async (reduced = false, strip = BELOW) => {
  page.motion = reduced ? 'reduce' : 'no-preference'
  page.strip  = strip
  stubCanvas()
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.querySelector('canvas')) return MAP as DOMRect
    return (this.firstElementChild?.tagName === 'SECTION' ? page.strip : BELOW) as DOMRect
  })
  const { component: NotFound, sky } = await freshSky(() => import('../../theme/NotFound.tsx'))
  const posted                       = vi.spyOn(Worker.prototype, 'postMessage')
  const wrapper                      = mount(NotFound)
  await flushPromises()
  return { posted, sky, wrapper }
}

/**
 * Reads the page's account of the pass over the spot: the label, the strip's
 * readings, whether its ridge stands, and whether the ring reads as pressed.
 */
const shownOf = (wrapper: Awaited<ReturnType<typeof mounted>>['wrapper']) => ({
  label    : wrapper.get('p.caps').text(),
  pressed  : wrapper.get(RING).attributes('aria-pressed'),
  readings : wrapper.findAll('dd').map(reading => reading.text()),
  ridge    : wrapper.find('path[fill-opacity]').exists()
})

const NONE = { label: 'Not found · No pass', readings: ['0', '—', '—'], ridge: false }
const ONE  = { label: 'Not found · One pass', readings: ['1', '71°', 'Now'], ridge: true }

it.each([
  ['reads no pass over the spot before the ring is pressed', false, 0, 0, { ...NONE, pressed: 'false' }],
  ['still reads no pass while the called pass crosses toward the spot', false, 1, 0.5,
    { ...NONE, pressed: 'true' }],
  ['reads one pass once the called pass reaches the spot', false, 1, 4.2, { ...ONE, pressed: 'true' }],
  ['reads one pass at once under reduced motion', true, 1, 0, { ...ONE, pressed: 'true' }],
  ['reads no pass again once the ring is pressed a second time', true, 2, 0, { ...NONE, pressed: 'false' }]
])('%s', async (_, reduced, presses, seconds, shown) => {
  const { wrapper } = await mounted(reduced)
  for (let press = 0; press < presses; press++) await wrapper.get(RING).trigger('click')
  page.frame({ delta: seconds * 1000 })
  await flushPromises()
  expect(shownOf(wrapper)).toEqual(shown)
})

it('asks for the catalog only once the numeral is pressed', async () => {
  const { posted, wrapper } = await mounted()
  const loads               = () => posted.mock.calls.filter(([asked]) => asked.type === 'load').length
  await wrapper.get(RING).trigger('click')
  page.resized()
  await flushPromises()
  const before = loads()
  await wrapper.get(NUMERAL).trigger('click')
  await flushPromises()
  expect([before, loads()]).toEqual([0, 1])
})

it('gathers the sky into 404 holding the hour, and back to the present on a second press', async () => {
  const { sky, wrapper } = await mounted()
  const numeral          = wrapper.get(NUMERAL)
  const pressed          = async () => {
    await numeral.trigger('click')
    await flushPromises()
    return [numeral.attributes('aria-pressed'), sky.gather.value, sky.clock.value]
  }
  expect([await pressed(), await pressed()]).toEqual([
    ['true', { height: 552, left: 24, top: 24, width: 352 }, 'held'],
    ['false', null, 'live']
  ])
})

it('draws the sky on its map only while the numeral stands pressed', async () => {
  const { wrapper } = await mounted()
  const live        = async () => {
    await wrapper.get(NUMERAL).trigger('click')
    await flushPromises()
    return wrapper.get('[data-map]').attributes('live')
  }
  const before      = wrapper.get('[data-map]').attributes()
  expect([before.backdrop, before.live, await live(), await live()]).toEqual(['true', 'false', 'true', 'false'])
})

it('sets the numeral and the ring as unpressed toggles of type button', async () => {
  const { wrapper } = await mounted()
  const toggles     = [NUMERAL, RING].map(found => wrapper.get(found).attributes())
  expect(toggles.map(({ 'aria-pressed': pressed, type }) => [type, pressed]))
    .toEqual([['button', 'false'], ['button', 'false']])
})

it('neither loads nor gathers the sky where the numeral is pressed again before it loads', async () => {
  const { posted, sky, wrapper } = await mounted()
  const numeral                  = wrapper.get(NUMERAL)
  await numeral.trigger('click')
  await numeral.trigger('click')
  await flushPromises()
  expect([numeral.attributes('aria-pressed'), sky.gather.value, sky.clock.value, posted.mock.calls])
    .toEqual(['false', null, 'live', []])
})

it('lets the sky go and returns to the present once it unmounts gathered', async () => {
  const { sky, wrapper } = await mounted()
  await wrapper.get(NUMERAL).trigger('click')
  await flushPromises()
  wrapper.unmount()
  await flushPromises()
  expect([sky.gather.value, sky.clock.value]).toEqual([null, 'live'])
})

it('gathers the sky again on a resize only while it is gathered', async () => {
  const { sky, wrapper } = await mounted()
  page.resized()
  await flushPromises()
  const before = sky.gather.value
  await wrapper.get(NUMERAL).trigger('click')
  await flushPromises()
  const room = sky.gather.value
  page.resized()
  await flushPromises()
  expect([before, sky.gather.value === room, sky.gather.value]).toEqual([null, false, room])
})

it('names the address that holds no page, then reaches the way back, the numeral, and the ring', async () => {
  history.replaceState(null, '', '/no-such-page/')
  const { wrapper } = await mounted()
  expect(wrapper.findAll('p').map(line => line.text()).slice(0, 2)).toEqual(
    ['Not found · No pass', `There is no page at ${location.host}/no-such-page/.`])
  expect(wrapper.findAll('a, button').map(control => control.attributes('aria-label') ?? control.text()))
    .toEqual(['Back to the map', 'Gather the sky into 404', 'Wait at the spot for a pass'])
})

it.each([
  ['below the map', BELOW, 0],
  ['across the map’s foot', { bottom: 600, left: 0, right: 400, top: 520 }, 80]
])('lifts the map’s credit above a strip %s by %i px', async (_, strip, covered) => {
  const { wrapper } = await mounted(false, strip)
  expect(wrapper.get('[style*="--covered"]').attributes('style')).toContain(`--covered: ${covered}px`)
})
