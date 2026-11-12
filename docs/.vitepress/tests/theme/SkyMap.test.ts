// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi }       from 'vitest'
import { ref }                  from 'vue'

import { TRACK_WIDTH } from '../../lib/orbit/scan.ts'
import { SHEETS }      from '../../lib/site/sheets.ts'
import { passOf }      from '../fixtures/passes.ts'

const { cameraForBounds, easeTo, fitBounds, gather, handlers } = vi.hoisted(() => ({
  cameraForBounds : vi.fn(() => ({ center: [-71, 42], zoom: 8 })),
  easeTo          : vi.fn(),
  fitBounds       : vi.fn(),
  gather          : vi.fn(),
  handlers        : new Map<string, (event: unknown) => void>()
}))

vi.mock('maplibre-gl', () => ({
  LngLat       : { convert: ([lng, lat]: [number, number]) => ({ lat, lng }) },
  LngLatBounds : class {
    points: number
    constructor(...corners: unknown[]) { this.points = corners.length }
    extend()  {
      this.points++
      return this
    }
    isEmpty() { return !this.points }
  },
  Map          : class {
    keyboard        = { disableRotation() {} }
    touchZoomRotate = { disableRotation() {} }
    cameraForBounds = cameraForBounds
    easeTo          = easeTo
    fitBounds       = fitBounds
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
      gather = gather
      labels = [{ latitude: 0, longitude: 10 * 360 / (512 * 2 ** 5), name: 'Town', tier: 'city' }]
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
 * stylesheet already linked.
 */
const mounted = async () => {
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.stubGlobal('requestAnimationFrame', () => 0)
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } })
  document.head.append(Object.assign(document.createElement('link'), { href: SHEETS.map.href }))
  vi.resetModules()
  const { sky }             = await import('../../lib/state/sky.ts')
  const { default: SkyMap } = await import('../../theme/SkyMap.vue')
  const wrapper             = mount(SkyMap)
  await flushPromises()
  const pass                = passOf(1)
  sky.tracks.add([pass], new Float32Array(2 * TRACK_WIDTH), Uint32Array.of(0), 2)
  cameraForBounds.mockClear()
  easeTo.mockClear()
  return { pass, sky, wrapper }
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
    center   : [expect.closeTo(10 * 360 / (512 * 2 ** 5)), 0],
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
