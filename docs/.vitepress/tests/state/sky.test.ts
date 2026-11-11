// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const opened = async (fragment: string) => {
  history.replaceState(null, '', `/somewhere?at=1${fragment}`)
  vi.resetModules()
  return (await import('../../lib/state/sky.ts')).sky
}

describe('the spot in the address', () => {
  beforeEach(() => vi.stubGlobal('Worker', class { postMessage() {} }))

  it.each([
    ['#-33.87,151.21', { latitude: -33.87, longitude: 151.21 }, null],
    ['#boston', { latitude: 42.36, longitude: -71.06 }, 'Boston'],
    ['', { latitude: 42.36, longitude: -71.06 }, 'Boston']
  ])('opens a page addressed %j on %o over %j', async (fragment, spot, place) => {
    const sky = await opened(fragment)
    expect(sky.spot.value).toEqual(spot)
    expect(sky.place.value).toBe(place)
  })
  it('writes a chosen spot into the address rounded', async () => {
    const sky = await opened('')
    sky.pick({ latitude: 48.85837, longitude: 2.29448 }, 'Paris')
    expect(location.hash).toBe('#48.86,2.29')
  })
  it('clears the address of any spot once the browser locates the reader', async () => {
    const sky = await opened('#48.86,2.29')
    sky.locate({ latitude: 51.50073, longitude: -0.12463 })
    expect(location.href).toBe(`${location.origin}/somewhere?at=1`)
    expect(sky.spot.value).toEqual({ latitude: 51.50073, longitude: -0.12463 })
    expect(sky.place.value).toBe('your location')
  })
})
