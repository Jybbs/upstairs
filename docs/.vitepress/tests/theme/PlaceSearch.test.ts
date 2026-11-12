// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { fresh }  from '../fixtures/fresh.ts'
import { passOf } from '../fixtures/passes.ts'

it('leaves a spot found through Near me out of the address', async () => {
  const coords  = { latitude: 51.50073, longitude: -0.12463 }
  const located = (found: PositionCallback) => found({ coords } as GeolocationPosition)
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: located } })
  history.replaceState(null, '', '/#48.86,2.29')
  const { default: PlaceSearch } = await import('../../theme/PlaceSearch.vue')
  await mount(PlaceSearch).get('button').trigger('click')
  expect(location.hash).toBe('')
})

it('lists the highest pass of each satellite the words typed name, and holds the one chosen', async () => {
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const [{ sky }, { default: PlaceSearch }] = await fresh(() =>
    Promise.all([import('../../lib/state/sky.ts'), import('../../theme/PlaceSearch.vue')]))
  const passes = [
    passOf(25544, { name: 'ISS (ZARYA)', peak: 30 }),
    passOf(25544, { key: '25544/2000', name: 'ISS (ZARYA)', peak: 70 }),
    passOf(48274, { name: 'CSS (TIANHE)' })
  ]
  sky.tracks.add(passes, new Float32Array(9), Uint32Array.of(0, 3, 6), 1)
  const wrapper = mount(PlaceSearch)
  await wrapper.get('input').setValue('iss')
  const results = wrapper.findAll('li button')
  expect(results.map(result => result.text())).toEqual(['ISS (ZARYA)'])
  await results[0].trigger('click')
  expect([sky.pinned.value, wrapper.find('li').exists()]).toEqual([passes[1], false])
})
