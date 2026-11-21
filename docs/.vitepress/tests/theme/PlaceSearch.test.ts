// @vitest-environment happy-dom
import { type VueWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi }                                from 'vitest'

import * as catalog            from '../../lib/orbit/catalog.ts'
import type { sky as Sky }      from '../../lib/state/sky.ts'
import { passOf }               from '../common/passes.ts'
import { addScanned, freshSky } from '../common/sky.ts'
import { stubMatchMedia }       from '../common/stubs.ts'
import photon                   from '../fixtures/photon.json' with { type: 'json' }

enableAutoUnmount(afterEach)

/**
 * Mounts the search as `mounted` does and types `iss` into it, returning the
 * search.
 */
const listed = async (set: (sky: typeof Sky) => void) => {
  const search = await mounted(set)
  await search.wrapper.get('input').trigger('focusin')
  await search.wrapper.get('input').setValue('iss')
  return search
}

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
  vi.restoreAllMocks()
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

it('lists each satellite the words typed name by its next rise, and holds the pass chosen', async () => {
  const passes           = [
    passOf(25544, { key: '25544/2000', name: 'ISS (ZARYA)', peak: 70, riseAt: 2000, setAt: 2600 }),
    passOf(25544, { name: 'ISS (ZARYA)', peak: 30 }),
    passOf(48274, { name: 'CSS (TIANHE)' })
  ]
  const { sky, wrapper } = await listed(state => {
    addScanned(state, passes)
    state.now.value = 0
  })
  const results = wrapper.findAll('li button')
  expect(results.map(result => result.text())).toEqual([`ISS (ZARYA) Rises ${sky.clockOf(300)}`])
  await results[0].trigger('click')
  expect([sky.pinned.value, sky.at.value, wrapper.find('li').exists()]).toEqual([passes[1], 600, false])
})

it.each([
  ['says a satellite whose pass is under way is up', 600, () => 'Up now'],
  ['says a satellite whose pass rises this minute is up', 300, () => 'Up now'],
  ['says a satellite whose pass sets this minute is up', 900, () => 'Up now'],
  ['says when a satellite’s last pass set, where none is still ahead', 1000,
    (sky: typeof Sky) => `Set ${sky.clockOf(900)}`]
])('%s', async (_, now, note) => {
  const { sky, wrapper } = await listed(state => {
    addScanned(state, [passOf(25544, { name: 'ISS (ZARYA)' })])
    state.now.value = now
  })
  expect(wrapper.get('li button').text()).toBe(`ISS (ZARYA) ${note(sky)}`)
})

it.each([
  ['says a satellite matched over the whole catalog has no pass once the scan finishes', true,
    'ISS (ZARYA) No pass this hour'],
  ['says the scan is still tracing where it has not finished', false, 'ISS (ZARYA) Still tracing']
])('%s', async (_, done, line) => {
  const { sky, wrapper } = await listed(state => {
    state.satellites.value = [{ epoch: 0, id: 25544, kind: 'crewed', name: 'ISS (ZARYA)' }]
    state.done.value       = done
  })
  const result = wrapper.get('li button')
  await result.trigger('click')
  expect([result.text(), result.attributes('aria-disabled'), sky.pinned.value]).toEqual([line, 'true', null])
})

it.each([
  ['the catalog has expired', (sky: typeof Sky) => {
    sky.loaded.value = { count: 1, fetched: sky.start.value - 15 * catalog.DAY }
  }],
  ['the trace stopped', (sky: typeof Sky) => {
    sky.loaded.value   = { count: 1, fetched: sky.start.value }
    sky.untraced.value = true
  }]
])('says a satellite with no pass was not traced where %s', async (_, set) => {
  const { wrapper } = await listed(state => {
    state.satellites.value = [{ epoch: 0, id: 25544, kind: 'crewed', name: 'ISS (ZARYA)' }]
    set(state)
  })
  expect(wrapper.get('li button').text()).toBe('ISS (ZARYA) Not traced')
})

it('says when a satellite’s last pass set, of two that have set', async () => {
  const { sky, wrapper } = await listed(state => {
    addScanned(state, [
      passOf(25544, { key: '25544/0', name: 'ISS (ZARYA)', riseAt: 0, setAt: 200 }),
      passOf(25544, { name: 'ISS (ZARYA)', riseAt: 300, setAt: 600 })
    ])
    state.now.value = 1000
  })
  expect(wrapper.get('li button').text()).toBe(`ISS (ZARYA) Set ${sky.clockOf(600)}`)
})

it('moves to the first place on submit, past a satellite listed with no pass', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(photon)))
  const { sky, wrapper } = await mounted(state => {
    state.satellites.value = [{ epoch: 0, id: 99999, kind: 'other', name: 'LONDON SAT' }]
  })
  await wrapper.get('input').trigger('focusin')
  await typed(wrapper, 'london')
  await wrapper.get('form').trigger('submit')
  expect([sky.pinned.value, sky.spot.value]).toEqual([null, { latitude: 51.5074456, longitude: -0.1277653 }])
})

it('chooses nothing on submit where every result is a satellite with no pass', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
  const { sky, wrapper } = await mounted(state => {
    state.satellites.value = [{ epoch: 0, id: 25544, kind: 'crewed', name: 'ISS (ZARYA)' }]
  })
  const spot = sky.spot.value
  await wrapper.get('input').trigger('focusin')
  await typed(wrapper, 'iss')
  await wrapper.get('form').trigger('submit')
  expect([sky.pinned.value, sky.spot.value, wrapper.find('li').exists()]).toEqual([null, spot, true])
})

it.each([
  ['lists each place found, naming its city, state, and country once each',
    async () => Response.json({ ...photon, features: photon.features.map(feature =>
      ({ ...feature, properties: { ...feature.properties, city: feature.properties.name } })) }),
    ['London, England, United Kingdom city', 'London, Ontario, Canada city']],
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
    'london', photon, ['London, England, United Kingdom city', 'London, Ontario, Canada city']],
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
    addScanned(state, [passOf(25544, { name: 'ISS (ZARYA)', riseAt: 3000 })]))
  await wrapper.get('input').trigger('focusin')
  await typed(wrapper, 'iss')
  expect(wrapper.findAll('li').map(line => line.text().split(' Rises')[0])).toEqual(['ISS (ZARYA)'])
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

it.each([0, 1])('moves to the place chosen of two sharing a name and region, as result %i', async at => {
  const twins            = photon.features.map((feature, index) =>
    ({ ...feature, properties: { ...photon.features[0].properties, osm_id: index } }))
  const { sky, wrapper } = await searched('london', async () => Response.json({ ...photon, features: twins }))
  await wrapper.findAll('li button')[at].trigger('click')
  const [longitude, latitude] = twins[at].geometry.coordinates
  expect(sky.spot.value).toEqual({ latitude, longitude })
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

it.each([
  ['opens the list above the search where the space below cannot hold it', 600, 'top', '588px'],
  ['opens the list below the search where the space below holds it', 80, 'bottom', '531px']
])('%s, no taller than the space it opens into', async (_, top, side, height) => {
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(667)
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(390)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(448)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(358)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.matches('form') ? DOMRect.fromRect({ height: 44, width: 358, x: 16, y: top }) : new DOMRect()
  })
  const { wrapper } = await listed(state => addScanned(state, [passOf(25544, { name: 'ISS (ZARYA)' })]))
  await vi.advanceTimersByTimeAsync(100)
  const positioner = wrapper.get('[data-part=positioner]').element as HTMLElement
  expect([wrapper.get('ul').attributes('data-placement'), positioner.style.getPropertyValue('--available-height')])
    .toEqual([side, height])
})
