// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { expect, it, vi }         from 'vitest'
import { ref }                    from 'vue'

import { passOf }               from '../fixtures/passes.ts'
import { addScanned, freshSky } from '../fixtures/sky.ts'

/**
 * The heights the sheet measures, in the order it measures them: its peek, the
 * pinned pass below it, and the whole sheet.
 */
const HEIGHTS = vi.hoisted(() => ({ next: 0, of: [100, 200, 600] }))

vi.mock('../../lib/site/provenance.data.ts', () => import('../fixtures/provenance.ts'))
vi.mock('@vueuse/core', async original => ({
  ...await original<typeof import('@vueuse/core')>(),
  useElementSize: () => ({ height: ref(HEIGHTS.of[HEIGHTS.next++ % HEIGHTS.of.length]) })
}))

/**
 * Drags the sheet from 400 px down the page through each point of `path`, a
 * pointer's place and the milliseconds since the press, and lets it go.
 */
const dragged = async (wrapper: VueWrapper, path: number[][]) => {
  const sheet = wrapper.get('section')
  Object.assign(sheet.element, { setPointerCapture() {} })
  const clock = vi.spyOn(performance, 'now')
  await sheet.trigger('pointerdown', { clientX: 100, clientY: 400 })
  for (const [x, y, at] of path) {
    clock.mockReturnValue(at)
    await sheet.trigger('pointermove', { clientX: x, clientY: y })
  }
  await sheet.trigger('pointerup')
  clock.mockRestore()
  return sheet
}

/**
 * Mounts a phone's sheet over a fresh copy of the shared state and a stand-in
 * worker, its panels stubbed, with one pass in the scan, pinned where `pinned`
 * is set.
 */
const mounted = async (pinned: boolean) => {
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))
  HEIGHTS.next                    = 0
  const { component: Sheet, sky } = await freshSky(() => import('../../theme/Sheet.vue'))
  const pass                      = passOf(1)
  const stubs                     = {
    Filters: true, PassList: true, PassReadout: true, Readout: true, TimeStrip: true
  }
  addScanned(sky, [pass])
  const wrapper = mount(Sheet, { global: { stubs } })
  if (pinned) sky.pin(pass)
  await wrapper.vm.$nextTick()
  return { sky, wrapper }
}

it.each([
  ['rises from peek to full and back down to peek with no pass pinned', false,
    ['Raise the sheet', 'Lower the sheet', 'Raise the sheet']],
  ['rests at half once a pass is pinned, and rises to full and back down to half', true,
    ['Raise the sheet to the hour’s list', 'Lower the sheet', 'Raise the sheet to the hour’s list']]
] as const)('%s', async (_, pinned, labels) => {
  const { wrapper } = await mounted(pinned)
  const handle      = wrapper.get('button')
  const read        = [handle.attributes('aria-label')]
  for (const _press of [1, 2]) {
    await handle.trigger('click')
    read.push(handle.attributes('aria-label'))
  }
  expect(read).toEqual(labels)
})

it('falls back to peek once the pinned pass is let go', async () => {
  const { sky, wrapper } = await mounted(true)
  sky.release()
  await wrapper.vm.$nextTick()
  expect(wrapper.get('button').attributes('aria-label')).toBe('Raise the sheet')
})

it('closes the hour’s list on the shield beside the active count and the orbits time', async () => {
  const { wrapper } = await mounted(false)
  const scroller    = wrapper.get('.overflow-y-auto')
  const footer      = scroller.get(':scope > footer')
  expect([...scroller.element.children].map(child => child.localName))
    .toEqual(['filters-stub', 'pass-list-stub', 'footer'])
  expect(footer.find('svg.shield').exists()).toBe(true)
  expect(footer.findAll('dt').map(dt => dt.text())).toEqual(['Active', 'Orbits'])
})

it('uncovers the map once it unmounts', async () => {
  const { sky, wrapper } = await mounted(false)
  sky.covered.value      = 120
  wrapper.unmount()
  expect(sky.covered.value).toBe(0)
})

it.each([
  ['covers the map up to its peek at rest', false, 100],
  ['covers the map down to the pinned pass once one is pinned', true, 300]
] as const)('%s', async (_, pinned, covered) => {
  const { sky } = await mounted(pinned)
  expect(sky.covered.value).toBe(covered)
})

it('lets the pinned pass go once a drag drops the sheet to its peek', async () => {
  const { sky, wrapper } = await mounted(true)
  await dragged(wrapper, [[100, 420, 0], [100, 600, 1000]])
  expect(sky.pinned.value).toBeNull()
})

it('throws the sheet up to full on a quick short drag', async () => {
  const { wrapper } = await mounted(false)
  await dragged(wrapper, [[100, 390, 0], [100, 360, 10]])
  expect(wrapper.get('button').attributes('aria-label')).toBe('Lower the sheet')
})

it('leaves the sheet where it stands once a drag turns across the page', async () => {
  const { wrapper } = await mounted(false)
  const sheet       = await dragged(wrapper, [[130, 402, 0], [130, 200, 10]])
  expect(sheet.attributes('style')).toContain('translateY(500px)')
})
