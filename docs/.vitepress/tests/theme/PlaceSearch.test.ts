// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

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
