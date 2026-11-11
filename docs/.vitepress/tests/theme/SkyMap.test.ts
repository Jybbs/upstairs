// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi }       from 'vitest'
import { ref }                  from 'vue'

import { TRACK_WIDTH } from '../../lib/orbit/scan.ts'
import { SHEETS }      from '../../lib/site/sheets.ts'
import { passOf }      from '../fixtures/passes.ts'

const { fitBounds, gather } = vi.hoisted(() => ({ fitBounds: vi.fn(), gather: vi.fn() }))

vi.mock('maplibre-gl', () => ({
  LngLatBounds : class { extend() {} },
  Map          : class {
    keyboard        = { disableRotation() {} }
    touchZoomRotate = { disableRotation() {} }
    fitBounds      = fitBounds
    getCenter()    { return { lat: 0, lng: 0 } }
    getContainer() { return { clientHeight: 600, clientWidth: 800 } }
    getZoom()      { return 5 }
    on()           {}
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
vi.mock('../../lib/map/overlay.ts', () => ({
  Overlay: class {
    gather = gather
    view   = { set() {} }
    invalidate() {}
    resize()     {}
  }
}))

/**
 * Mounts the map over a fresh copy of the shared state and a stand-in worker,
 * its frame 600 pixels tall, with its stylesheet already linked.
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
  mount(SkyMap)
  await flushPromises()
  return sky
}

it('gives each pass its point in the numeral again once a scan lands while the sky is gathered', async () => {
  const sky        = await mounted()
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
  const sky  = await mounted()
  const pass = passOf(1)
  sky.tracks.add([pass], new Float32Array(TRACK_WIDTH), Uint32Array.of(0), 1)
  sky.covered.value = covered
  sky.pin(pass)
  await flushPromises()
  const [, { padding }] = fitBounds.mock.lastCall!
  expect(padding).toEqual({ bottom: covered + edge, left: 48, right: 48, top: edge })
})
