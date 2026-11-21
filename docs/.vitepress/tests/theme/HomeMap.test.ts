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

/**
 * Mounts the home page over a fresh copy of the shared state, every component
 * it places stubbed, on a page as narrow as a phone's where `phone` is set,
 * with the spot chooser open where `choosing` is set.
 */
const mounted = async (choosing: boolean, phone: boolean) => {
  stubMatchMedia(() => phone)
  const { component: HomeMap, sky } = await freshSky(() => import('../../theme/HomeMap.tsx'))
  if (choosing) sky.choose()
  return shallowMount(HomeMap)
}

it.each([
  ['places the readout, the strip, and the panels below the map on a wide page', false,
    ['sky-map-stub', 'readout-stub', 'time-strip-stub', 'transition-stub', 'focus-stub', 'filters-stub',
      'pass-list-stub', 'entries-stub', 'stamp-stub']],
  ['places the sheet alone over the map on a phone', true, ['sky-map-stub', 'sheet-stub', 'transition-stub']]
])('%s', async (_, phone, names) => {
  const wrapper = await mounted(false, phone)
  const stubs   = [...wrapper.element.querySelectorAll('*')]
    .map(found => found.localName)
    .filter(name => name.endsWith('-stub'))
  expect(stubs).toEqual(names)
})

it.each([
  ['holds the readout and the strip inert under the open spot chooser', true, ['', true]],
  ['leaves the readout and the strip live while the spot chooser is shut', false, [undefined, false]]
])('%s', async (_, choosing, shown) => {
  const wrapper = await mounted(choosing, false)
  const panels  = wrapper.get('main > div > div')
  expect([panels.attributes('inert'), wrapper.findComponent({ name: 'SpotChooser' }).exists()]).toEqual(shown)
})

it('asks for the catalog once the home page mounts', async () => {
  stubMatchMedia(() => false)
  const { component: HomeMap } = await freshSky(() => import('../../theme/HomeMap.tsx'))
  const posted                 = vi.spyOn(Worker.prototype, 'postMessage')
  shallowMount(HomeMap)
  expect(posted.mock.calls.map(([asked]) => asked.type).filter(type => type === 'load')).toEqual(['load'])
})

it.each([
  ['keeps names out of the readout and the strip on a wide page', false, ['readout-stub', 'time-strip-stub']],
  ['keeps names out of the sheet on a phone', true, ['sheet-stub']]
])('%s', async (_, phone, names) => {
  const wrapper = await mounted(false, phone)
  expect(wrapper.findAll('[data-label-clear]').map(found => found.element.localName)).toEqual(names)
})
