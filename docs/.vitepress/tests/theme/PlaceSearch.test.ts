// @vitest-environment happy-dom
import { type VueWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi }                                from 'vitest'

import type { sky as Sky } from '../../lib/state/sky.ts'
import { passOf }          from '../common/passes.ts'
import { freshSky }        from '../common/sky.ts'
import { stubMatchMedia }  from '../common/stubs.ts'
import photon              from '../fixtures/photon.json' with { type: 'json' }

enableAutoUnmount(afterEach)

/**
 * Mounts the search in the page over a fresh copy of the shared state, after
 * `set` has changed what the state holds.
 */
const mounted = async (set: (sky: typeof Sky) => void = () => {}) => {
  vi.useFakeTimers()
  stubMatchMedia(() => false)
  const { component: PlaceSearch, sky } = await freshSky(() => import('../../theme/PlaceSearch.tsx'))
  set(sky)
  return { sky, wrapper: mount(PlaceSearch, { attachTo: document.body }) }
}

/**
 * Mounts the search, whose place search `reply` answers, types `words` into
 * it, and lets the search's wait pass.
 */
const searched = async (words: string, reply: () => Promise<Response>) => {
  vi.stubGlobal('fetch', vi.fn(reply))
  const search = await mounted()
  await search.wrapper.get('input').trigger('focusin')
  await typed(search.wrapper, words)
  return search
}

/**
 * Types `words` into the search and lets the search's wait pass.
 */
const typed = async (wrapper: VueWrapper, words: string) => {
  await wrapper.get('input').setValue(words)
  await vi.advanceTimersByTimeAsync(350)
  await flushPromises()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('leaves a spot found through Near me out of the address', async () => {
  const coords  = { latitude: 51.50073, longitude: -0.12463 }
  const located = (found: PositionCallback) => found({ coords } as GeolocationPosition)
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: located } })
  const { wrapper } = await mounted()
  history.replaceState(null, '', '/#48.86,2.29')
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
  await wrapper.get('input').trigger('focusin')
  await wrapper.get('input').setValue('iss')
  const results = wrapper.findAll('li button')
  expect(results.map(result => result.text())).toEqual(['ISS (ZARYA)'])
  await results[0].trigger('click')
  expect([sky.pinned.value, wrapper.find('li').exists()]).toEqual([passes[1], false])
})

it('shows the kind of a satellite chosen while its kind is switched off, and holds its pass', async () => {
  const pass             = passOf(44713, { kind: 'starlink', name: 'STARLINK-1007' })
  const { sky, wrapper } = await mounted(state =>
    state.tracks.add([pass], new Float32Array(3), Uint32Array.of(0), 1))
  const before           = sky.traced.starlink
  await wrapper.get('input').trigger('focusin')
  await wrapper.get('input').setValue('starlink')
  await wrapper.get('li button').trigger('click')
  expect([before, sky.traced.starlink, sky.pinned.value, sky.shown.value])
    .toEqual([false, true, pass, pass])
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

it.each([
  ['keeps the message for the words now typed where an earlier search fails later',
    'london', { ...photon, features: [] }, ['No place by that name.']],
  ['keeps the places for the words now typed where an earlier search fails later',
    'london', photon, ['London, England, United Kingdom', 'London, Ontario, Canada']],
  ['shows nothing where a search fails once the words fall below three letters',
    'lo', { ...photon, features: [] }, []]
])('%s', async (_, words, answer, lines) => {
  let fail: (reason: Error) => void = () => {}
  const reply                       = vi.fn<() => Promise<Response>>()
    .mockReturnValueOnce(new Promise((_, reject) => { fail = reject }))
    .mockResolvedValueOnce(Response.json(answer))
  const { wrapper } = await searched('lond', reply)
  await typed(wrapper, words)
  fail(new TypeError('fetch failed'))
  await flushPromises()
  expect(wrapper.findAll('li').map(line => line.text())).toEqual(lines)
})

it('keeps the message for the words now typed where an earlier search answers later', async () => {
  let answer: (response: Response) => void = () => {}
  const reply                               = vi.fn<() => Promise<Response>>()
    .mockReturnValueOnce(new Promise(resolve => { answer = resolve }))
    .mockRejectedValueOnce(new TypeError('fetch failed'))
  const { wrapper } = await searched('lond', reply)
  await typed(wrapper, 'london')
  answer(Response.json(photon))
  await flushPromises()
  expect(wrapper.findAll('li').map(line => line.text())).toEqual(['The place search is not answering.'])
})

it('drops the places an earlier search listed where the search for the words now typed fails', async () => {
  const reply = vi.fn<() => Promise<Response>>()
    .mockResolvedValueOnce(Response.json(photon))
    .mockRejectedValueOnce(new TypeError('fetch failed'))
  const { wrapper } = await searched('london', reply)
  await typed(wrapper, 'londres')
  expect(wrapper.findAll('li').map(line => line.text())).toEqual(['The place search is not answering.'])
})

it('lists only the satellites the words name where the place search fails beside them', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
  const { wrapper } = await mounted(state =>
    state.tracks.add([passOf(25544, { name: 'ISS (ZARYA)' })], new Float32Array(3), Uint32Array.of(0), 1))
  await wrapper.get('input').trigger('focusin')
  await typed(wrapper, 'iss')
  expect(wrapper.findAll('li').map(line => line.text())).toEqual(['ISS (ZARYA)'])
})

it('sends no search where the words fall below three letters before the wait ends', async () => {
  vi.stubGlobal('fetch', vi.fn())
  const input = (await mounted()).wrapper.get('input')
  await input.trigger('focusin')
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

it.each([
  ['highlights the first result on the down arrow', ['ArrowDown'], [true, false]],
  ['highlights the result below on a second down arrow', ['ArrowDown', 'ArrowDown'], [false, true]],
  ['highlights the result above on the up arrow', ['ArrowDown', 'ArrowDown', 'ArrowUp'], [true, false]]
] as const)('%s', async (_, keys, highlighted) => {
  const { wrapper } = await searched('new london', async () => Response.json(photon))
  for (const key of keys) await wrapper.get('input').trigger('keydown', { key })
  expect(wrapper.findAll('li button').map(result => result.attributes('data-highlighted') !== undefined))
    .toEqual(highlighted)
})

it('moves to the place highlighted on Enter', async () => {
  const { sky, wrapper } = await searched('new london', async () => Response.json(photon))
  const input            = wrapper.get('input')
  for (const key of ['ArrowDown', 'ArrowDown', 'Enter']) await input.trigger('keydown', { key })
  expect([sky.place.value, sky.spot.value, wrapper.find('li').exists()])
    .toEqual(['London', { latitude: 42.9836747, longitude: -81.2496068 }, false])
})

it('clears the words and the results on Escape', async () => {
  const { wrapper } = await searched('new london', async () => Response.json(photon))
  await vi.advanceTimersByTimeAsync(50)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await flushPromises()
  expect([(wrapper.get('input').element as HTMLInputElement).value, wrapper.find('li').exists()])
    .toEqual(['', false])
})

it('clears words too short to search on Escape', async () => {
  const { wrapper } = await searched('ne', async () => Response.json(photon))
  await wrapper.get('input').trigger('keydown', { key: 'Escape' })
  expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
})
