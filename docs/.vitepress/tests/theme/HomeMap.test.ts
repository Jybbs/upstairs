// @vitest-environment happy-dom
import { shallowMount }   from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { freshSky } from '../fixtures/sky.ts'

vi.mock('../../lib/site/entries.data.ts', () => ({ data: [] }))
vi.mock('../../lib/site/provenance.data.ts', () => import('../fixtures/provenance.ts'))

/**
 * Mounts the home page over a fresh copy of the shared state, every component
 * it places stubbed, on a page as narrow as a phone's where `phone` is set,
 * with the spot chooser open where `choosing` is set.
 */
const mounted = async (choosing: boolean, phone: boolean) => {
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: phone, removeEventListener() {} }))
  const { component: HomeMap, sky } = await freshSky(() => import('../../theme/HomeMap.vue'))
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
