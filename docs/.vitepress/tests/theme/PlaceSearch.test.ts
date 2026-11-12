// @vitest-environment happy-dom
import { flushPromises, mount }      from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import type { sky as Sky } from '../../lib/state/sky.ts'
import { passOf }          from '../fixtures/passes.ts'
import photon              from '../fixtures/photon.json' with { type: 'json' }
import { freshSky }        from '../fixtures/sky.ts'

/**
 * Mounts the search over a fresh copy of the shared state, after `set` has
 * changed what the state holds.
 */
const mounted = async (set: (sky: typeof Sky) => void = () => {}) => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const { component: PlaceSearch, sky } = await freshSky(() => import('../../theme/PlaceSearch.vue'))
  set(sky)
  return { sky, wrapper: mount(PlaceSearch) }
}

/**
 * Mounts the search, whose place search `reply` answers, types `words` into
 * it, and lets the search's wait pass.
 */
const searched = async (words: string, reply: () => Promise<Response>) => {
  vi.stubGlobal('fetch', vi.fn(reply))
  const search = await mounted()
  await search.wrapper.get('input').setValue(words)
  await vi.advanceTimersByTimeAsync(350)
  await flushPromises()
  return search
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('leaves a spot found through Near me out of the address', async () => {
  const coords  = { latitude: 51.50073, longitude: -0.12463 }
  const located = (found: PositionCallback) => found({ coords } as GeolocationPosition)
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: located } })
  history.replaceState(null, '', '/#48.86,2.29')
  const { wrapper } = await mounted()
  await wrapper.get('button').trigger('click')
  expect(location.hash).toBe('')
})

it('lists the highest pass of each satellite the words typed name, and holds the one chosen', async () => {
  const passes           = [
    passOf(25544, { name: 'ISS (ZARYA)', peak: 30 }),
    passOf(25544, { key: '25544/2000', name: 'ISS (ZARYA)', peak: 70 }),
    passOf(48274, { name: 'CSS (TIANHE)' })
  ]
  const { sky, wrapper } = await mounted(state =>
    state.tracks.add(passes, new Float32Array(9), Uint32Array.of(0, 3, 6), 1))
  await wrapper.get('input').setValue('iss')
  const results = wrapper.findAll('li button')
  expect(results.map(result => result.text())).toEqual(['ISS (ZARYA)'])
  await results[0].trigger('click')
  expect([sky.pinned.value, wrapper.find('li').exists()]).toEqual([passes[1], false])
})

it.each([
  ['lists each place found, naming its city, state, and country once each',
    async () => Response.json({ ...photon, features: photon.features.map(feature =>
      ({ ...feature, properties: { ...feature.properties, city: feature.properties.name } })) }),
    ['London, England, United Kingdom', 'London, Ontario, Canada']],
  ['says no place has that name where the search finds none',
    async () => Response.json({ ...photon, features: [] }), ['No place by that name.']],
  ['says the search is not answering where its host cannot be reached',
    async () => { throw new TypeError('fetch failed') }, ['The place search is not answering.']],
  ['says the search is not answering where its host answers with an error',
    async () => Response.json(photon, { status: 502 }), ['The place search is not answering.']]
])('%s', async (_, reply, lines) => {
  const { wrapper } = await searched('london', reply)
  expect(wrapper.findAll('li').map(line => line.text())).toEqual(lines)
})

it('sends no search where the words fall below three letters before the wait ends', async () => {
  vi.stubGlobal('fetch', vi.fn())
  const input = (await mounted()).wrapper.get('input')
  await input.setValue('lon')
  await input.setValue('lo')
  await vi.advanceTimersByTimeAsync(350)
  expect(fetch).not.toHaveBeenCalled()
})

it('searches for the words typed and moves to the place chosen, named by its first part', async () => {
  const { sky, wrapper } = await searched('new london', async () => Response.json(photon))
  await wrapper.findAll('li button')[1].trigger('click')
  expect(fetch).toHaveBeenCalledWith('https://photon.komoot.io/api/?limit=5&lang=en&q=new%20london')
  expect([sky.place.value, sky.spot.value, wrapper.find('li').exists()])
    .toEqual(['London', { latitude: 42.9836747, longitude: -81.2496068 }, false])
})
