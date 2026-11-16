// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi }       from 'vitest'
import { ref }                  from 'vue'

import { TRACK_WIDTH }    from '../../lib/orbit/scan.ts'
import { SHEETS }         from '../../lib/site/sheets.ts'
import { passOf }         from '../common/passes.ts'
import { freshSky }       from '../common/sky.ts'
import { stubMatchMedia } from '../common/stubs.ts'

const {
  GPU, TOWN, cameraForBounds, caught, draw, easeTo, fitBounds, frame, gather, handlers, thrown
} = vi.hoisted(() => ({
  GPU             : class extends Error {},
  TOWN            : 10 * 360 / (512 * 2 ** 5),
  caught          : vi.fn(),
  draw            : vi.fn(),
  easeTo          : vi.fn(),
  fitBounds       : vi.fn(),
  frame           : vi.fn((_loop: FrameRequestCallback) => 0),
  gather          : vi.fn(),
  handlers        : new Map<string, (event: unknown) => void>(),
  thrown          : { value: null as Error | null },
  cameraForBounds : vi.fn((_bounds: { points: unknown[] }, _options: object) =>
    ({ center: [-71, 42], zoom: 8 }))
}))

vi.mock('maplibre-gl', () => ({
  GPUInitializationError : GPU,
  LngLat                 : { convert: ([lng, lat]: [number, number]) => ({ lat, lng }) },
  LngLatBounds           : class {
    points: unknown[]
    constructor(...corners: unknown[]) { this.points = corners }
    extend(point: unknown) {
      this.points.push(point)
      return this
    }
    isEmpty() { return !this.points.length }
  },
  Map                    : class {
    keyboard        = { disableRotation() {} }
    touchZoomRotate = { disableRotation() {} }
    cameraForBounds = cameraForBounds
    easeTo          = easeTo
    fitBounds       = fitBounds
    constructor() { if (thrown.value) throw thrown.value }
    getCenter()    { return { lat: 0, lng: 0 } }
    getContainer() { return { clientHeight: 600, clientWidth: 800 } }
    getZoom()      { return 5 }
    on(type: string, run: (event: unknown) => void) { handlers.set(type, run) }
    remove()       {}
  },
  setWorkerUrl() {}
}))
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: '' }))
vi.mock('maplibre-contour', () => ({
  default: {
    DemSource: class {
      sharedDemProtocolUrl = ''
      contourProtocolUrl() { return '' }
      setupMaplibre()      {}
    }
  }
}))
vi.mock('vitepress', () => ({ useData: () => ({ isDark: ref(false) }) }))
vi.mock('../../lib/map/credit.ts', () => ({ CREDITS: [], holdCredit() {} }))
vi.mock('../../lib/map/overlay.ts', async () => {
  const { View } = await import('../../lib/map/mercator.ts')
  return {
    Overlay: class {
      draw   = draw
      gather = gather
      labels = [{ latitude: 0, longitude: TOWN, name: 'Town', tier: 'city' }]
      onMap  = new Uint16Array()
      view   = new View()
      crossing()   { return new Uint8Array(1) }
      invalidate() {}
      nearest()    { return null }
      resize()     {}
    }
  }
})

/**
 * Mounts the map over a fresh copy of the shared state holding one pass on the
 * horizon and a stand-in worker, its frame 600 pixels tall, with its
 * stylesheet already linked, the map's constructor throwing `error` where one
 * is given and every error the mount raises passed to `caught`.
 */
const mounted = async (error: Error | null = null) => {
  thrown.value = error
  caught.mockClear()
  stubMatchMedia(() => false)
  vi.stubGlobal('requestAnimationFrame', frame)
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } })
  document.head.append(Object.assign(document.createElement('link'), { href: SHEETS.map.href }))
  const { component: SkyMap, sky } = await freshSky(() => import('../../theme/SkyMap.tsx'))
  const wrapper                    = mount(SkyMap, { global: { config: { errorHandler: caught } } })
  await flushPromises()
  const pass                       = passOf(1)
  sky.tracks.add([pass], new Float32Array(2 * TRACK_WIDTH), Uint32Array.of(0), 2)
  cameraForBounds.mockClear()
  easeTo.mockClear()
  return { SkyMap, pass, sky, wrapper }
}

it('gives each pass its point in the numeral again once a scan lands while the sky is gathered', async () => {
  const { sky }    = await mounted()
  sky.gather.value = { height: 400, left: 24, top: 24, width: 600 }
  await flushPromises()
  sky.version.value++
  await flushPromises()
  expect(gather).toHaveBeenCalledTimes(2)
})

it.each([
  ['keeps its whole margin above a sheet leaving room for it', 200, 48],
  ['narrows its margin to a quarter of the strip a tall sheet leaves', 520, 20],
  ['keeps no margin where the sheet covers the frame', 640, 0]
] as const)('fits the pinned pass above the sheet and %s', async (_, covered, edge) => {
  const { pass, sky } = await mounted()
  sky.covered.value   = covered
  sky.pin(pass)
  await flushPromises()
  const [, { padding }] = fitBounds.mock.lastCall!
  expect(padding).toEqual({ bottom: covered + edge, left: 48, right: 48, top: edge })
})

it.each([
  ['centers the zoom buttons in the map above the sheet once a pass is pinned', 480, 'pin',
    'calc((100% - 480px) / 2)'],
  ['leaves the zoom buttons at the map’s middle with no pass pinned', 480, null, ''],
  ['leaves the zoom buttons at the map’s middle while a finger only holds a pass', 330, 'hold', ''],
  ['leaves the zoom buttons at the map’s middle where no sheet covers it', 0, 'pin', '']
] as const)('%s', async (_, covered, chosen, top) => {
  const { pass, sky, wrapper } = await mounted()
  sky.covered.value            = covered
  if (chosen === 'pin') sky.pin(pass)
  if (chosen === 'hold') sky.held.value = pass
  await flushPromises()
  expect((wrapper.get('[aria-label="Zoom"]').element as HTMLElement).style.top).toBe(top)
})

it('lets the pinned pass go on a press of the empty map', async () => {
  const { pass, sky } = await mounted()
  sky.pin(pass)
  handlers.get('click')!({ point: { x: 10, y: 10 } })
  expect(sky.pinned.value).toBeNull()
})

it('takes the zoom-in button and the Plus key to the chosen pass’s next step', async () => {
  const { pass, sky, wrapper } = await mounted()
  sky.selected.value           = pass
  sky.done.value               = true
  await flushPromises()
  await wrapper.get('button[aria-label="Zoom in"]').trigger('click')
  await wrapper.get('[data-map] > div').trigger('keydown', { key: '+' })
  expect(easeTo.mock.calls).toEqual([[{ center: [-71, 42], zoom: 8 }], [{ center: [-71, 42], zoom: 8 }]])
})

it('pulls the pin onto a town 10 px away once the map rests', async () => {
  const { sky } = await mounted()
  sky.choose()
  await flushPromises()
  handlers.get('moveend')!({})
  expect(easeTo).toHaveBeenLastCalledWith(expect.objectContaining({
    center   : [expect.closeTo(TOWN), 0],
    duration : 120
  }))
})

it('shuts the chooser once the map lands on the spot it set', async () => {
  const { sky } = await mounted()
  sky.choose()
  sky.land()
  await flushPromises()
  handlers.get('moveend')!({})
  expect(sky.choosing.value).toBe('shut')
})

it('eases the map back to the spot once the pinned pass is let go', async () => {
  const { pass, sky } = await mounted()
  sky.covered.value   = 200
  sky.pin(pass)
  await flushPromises()
  easeTo.mockClear()
  sky.release()
  await flushPromises()
  const { latitude, longitude } = sky.spot.value
  expect(easeTo.mock.calls).toEqual([[{ center: [longitude, latitude] }]])
})

it('gives a pass that never climbs past 30° only the step fitting its whole crossing', async () => {
  const { pass, sky } = await mounted()
  sky.selected.value  = pass
  sky.done.value      = true
  await flushPromises()
  expect(cameraForBounds).toHaveBeenCalledTimes(1)
})

it('takes the spot into the high stretch of a pass climbing past 30°', async () => {
  const { sky } = await mounted()
  const pass    = passOf(2)
  sky.tracks.add([pass], new Float32Array(2 * TRACK_WIDTH).fill(45), Uint32Array.of(0), 2)
  sky.selected.value = pass
  sky.done.value     = true
  await flushPromises()
  const { latitude, longitude } = sky.spot.value
  expect(cameraForBounds.mock.calls.map(([{ points }]) => points.at(-1)))
    .toEqual([[longitude, latitude], [45, 45]])
})

it.each([
  ['the browser offers no WebGL2 context', new GPU(), () => {}],
  ['a lost context fails to come back', null, () => handlers.get('error')!({ error: new GPU() })]
])('marks the map blank with no text over it where %s, its zoom raising no error', async (_, error, lose) => {
  const { sky, wrapper } = await mounted(error)
  lose()
  await flushPromises()
  await wrapper.get('button[aria-label="Zoom in"]').trigger('click')
  await wrapper.get('[data-map] > div').trigger('keydown', { key: '-' })
  expect([wrapper.find('[role="alert"]').exists(), sky.blank.value, easeTo.mock.calls])
    .toEqual([false, true, []])
})

it.each([
  ['draws each frame while the map can draw', () => {}, 1],
  ['draws no frame once a lost context fails to come back', () => {
    handlers.get('error')!({ error: new GPU() })
  }, 0]
])('%s', async (_, lose, drawn) => {
  await mounted()
  const loop = frame.mock.lastCall![0]
  lose()
  draw.mockClear()
  loop(1000)
  expect(draw).toHaveBeenCalledTimes(drawn)
})

it('names the host a source fails to reach', async () => {
  const { wrapper } = await mounted()
  handlers.get('error')!({ error: new Error('Failed to fetch'), sourceId: 'base' })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not reach OpenFreeMap')
})

it.each([
  ['grays the map where the catalog did not load', null, true],
  ['leaves the map in color where the catalog failed partway', { count: 9, fetched: 0 }, false]
])('%s', async (_, loaded, grayed) => {
  const { sky, wrapper } = await mounted()
  sky.loaded.value       = loaded
  sky.failed.value       = 'TypeError: Failed to fetch'
  await flushPromises()
  expect(wrapper.find('.backdrop-grayscale').exists()).toBe(grayed)
})

it('leaves the wheel to the page once a lost context fails to come back, whatever the pass', async () => {
  const { pass, sky, wrapper } = await mounted()
  sky.selected.value           = pass
  sky.done.value               = true
  handlers.get('error')!({ error: new GPU() })
  await flushPromises()
  const wheel = new WheelEvent('wheel', { cancelable: true, deltaY: -100 })
  wrapper.get('[data-map] > div').element.dispatchEvent(wheel)
  expect(wheel.defaultPrevented).toBe(false)
})

it('draws again on a later mount where the browser can draw', async () => {
  const { SkyMap, sky } = await mounted(new GPU())
  thrown.value          = null
  mount(SkyMap)
  await flushPromises()
  expect(sky.blank.value).toBe(false)
})

it('passes on any other error the map throws as it is made, leaving the map drawable', async () => {
  const error   = new Error('Invalid style')
  const { sky } = await mounted(error)
  expect([caught.mock.lastCall?.[0], sky.blank.value]).toEqual([error, false])
})
