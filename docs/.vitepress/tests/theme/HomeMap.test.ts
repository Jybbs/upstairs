// @vitest-environment happy-dom
import { shallowMount }   from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { freshSky }       from '../common/sky.ts'
import { stubMatchMedia } from '../common/stubs.ts'

vi.mock('../../theme/Entries.tsx', async () => (await import('../common/stubs.ts')).stubOf('Entries'))
vi.mock('../../theme/Filters.tsx', async () => (await import('../common/stubs.ts')).stubOf('Filters'))
vi.mock('../../theme/Focus.tsx', async () => (await import('../common/stubs.ts')).stubOf('Focus'))
vi.mock('../../theme/PassList.tsx', async () => (await import('../common/stubs.ts')).stubOf('PassList'))
vi.mock('../../theme/Readout.tsx', async () => (await import('../common/stubs.ts')).stubOf('Readout'))
vi.mock('../../theme/Sheet.tsx', async () => (await import('../common/stubs.ts')).stubOf('Sheet'))
vi.mock('../../theme/SkyMap.tsx', async () => (await import('../common/stubs.ts')).stubOf('SkyMap'))
vi.mock('../../theme/SpotChooser.tsx', async () => (await import('../common/stubs.ts')).stubOf('SpotChooser'))
vi.mock('../../theme/Stamp.tsx', async () => (await import('../common/stubs.ts')).stubOf('Stamp'))
vi.mock('../../theme/TimeStrip.tsx', async () => (await import('../common/stubs.ts')).stubOf('TimeStrip'))

type Page = 'desktop' | 'phone' | 'tablet'

/**
 * Mounts the home page over a fresh copy of the shared state, every component
 * it places stubbed but the sidebar, on a page as wide as `page`, with the
 * spot chooser open where `choosing` is set.
 */
const mounted = async (choosing: boolean, page: Page) => {
  stubMatchMedia(query =>
    page === 'phone' && query.includes('40rem') || page === 'desktop' && query.includes('64rem'))
  const { component: HomeMap, sky } = await freshSky(() => import('../../theme/HomeMap.tsx'))
  if (choosing) sky.choose()
  return shallowMount(HomeMap, { global: { stubs: { Sidebar: false } } })
}

it.each([
  ['places the card, the list, and the filters in a sidebar beside the map on a desktop', 'desktop',
    ['sky-map-stub', 'readout-stub', 'time-strip-stub', 'transition-stub', 'focus-stub', 'pass-list-stub',
      'filters-stub', 'entries-stub', 'stamp-stub']],
  ['places the readout, the strip, and the panels below the map on a tablet', 'tablet',
    ['sky-map-stub', 'readout-stub', 'time-strip-stub', 'transition-stub', 'focus-stub', 'filters-stub',
      'pass-list-stub', 'entries-stub', 'stamp-stub']],
  ['places the sheet alone over the map on a phone', 'phone',
    ['sky-map-stub', 'sheet-stub', 'transition-stub']]
] as const)('%s', async (_, page, names) => {
  const wrapper = await mounted(false, page)
  const stubs   = [...wrapper.element.querySelectorAll('*')]
    .map(found => found.localName)
    .filter(name => name.endsWith('-stub'))
  expect(stubs).toEqual(names)
})

it.each([
  ['holds the readout and the strip inert under the open spot chooser', true, ['', true]],
  ['leaves the readout and the strip live while the spot chooser is shut', false, [undefined, false]]
])('%s', async (_, choosing, shown) => {
  const wrapper = await mounted(choosing, 'tablet')
  const panels  = wrapper.get('main > div > div > div')
  expect([panels.attributes('inert'), wrapper.findComponent({ name: 'SpotChooser' }).exists()]).toEqual(shown)
})

it('keeps one map as the page widens past the desktop breakpoint', async () => {
  const widen                  = stubMatchMedia(() => false)
  const { component: HomeMap } = await freshSky(() => import('../../theme/HomeMap.tsx'))
  const wrapper                = shallowMount(HomeMap, { global: { stubs: { Sidebar: false } } })
  const before                 = wrapper.findComponent({ name: 'SkyMap' }).vm
  widen(true)
  await wrapper.vm.$nextTick()
  expect([wrapper.find('aside').exists(), wrapper.findComponent({ name: 'SkyMap' }).vm === before])
    .toEqual([true, true])
})

it('asks for the catalog once the home page mounts', async () => {
  stubMatchMedia(() => false)
  const { component: HomeMap } = await freshSky(() => import('../../theme/HomeMap.tsx'))
  const posted                 = vi.spyOn(Worker.prototype, 'postMessage')
  shallowMount(HomeMap)
  expect(posted.mock.calls.map(([asked]) => asked.type)).toEqual(['load'])
})

it.each([
  ['keeps names out of the readout and the strip on a wide page', 'tablet',
    ['readout-stub', 'time-strip-stub']],
  ['keeps names out of the sheet on a phone', 'phone', ['sheet-stub']]
] as const)('%s', async (_, page, names) => {
  const wrapper = await mounted(false, page)
  expect(wrapper.findAll('[data-label-clear]').map(found => found.element.localName)).toEqual(names)
})
