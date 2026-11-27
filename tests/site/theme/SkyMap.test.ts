// @vitest-environment happy-dom
import { enableAutoUnmount, flushPromises, mount }   from '@vue/test-utils'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { ref }                                       from 'vue'

import { STEEP, TRACK_WIDTH } from '../../../docs/.vitepress/lib/orbit/scan.ts'
import { SCHEMES }            from '../../../docs/.vitepress/lib/site/palette.ts'
import { SHEETS }             from '../../../docs/.vitepress/lib/site/sheets.ts'
import { passOf }             from '../common/passes.ts'
import { freshSky }           from '../common/sky.ts'
import { stubMatchMedia }     from '../common/stubs.ts'

const {
  DARK, GPU, TOWN, VERSION, cameraForBounds, caught, corner, draw, drawn, easeTo, fitBounds, frame, gather,
  handlers, invalidate, made, queried, setStyle, thrown
} = vi.hoisted(() => ({
  DARK            : { scheme: null as null | { value: boolean } },
  GPU             : class extends Error {},
  TOWN            : 10 * 360 / (512 * 2 ** 5),
  VERSION         : '6.19.0',
  caught          : vi.fn(),
  corner          : { x: 400, y: 300 },
  draw            : vi.fn(),
  drawn           : {
    overlay : { covered: () => [] as unknown[], labels: [] as unknown[], scheme: null as unknown },
    state   : {
      kinds  : {} as Record<string, boolean>,
      spot   : null as unknown,
      tracks : { passes: [] as unknown[] }
    }
  },
  easeTo          : vi.fn(),
  fitBounds       : vi.fn(),
  frame           : vi.fn((_loop: FrameRequestCallback) => 0),
  gather          : vi.fn(),
  handlers        : new Map<string, ((event: unknown) => void)[]>(),
  invalidate      : vi.fn(),
  made            : vi.fn(),
  queried         : vi.fn(),
  setStyle        : vi.fn(),
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
    getNorthWest() { return this.points[0] }
    getSouthEast() { return this.points.at(-1) }
    isEmpty()      { return !this.points.length }
  },
  Map                    : class {
    keyboard        = { disableRotation() {} }
    touchZoomRotate = { disableRotation() {} }
    cameraForBounds = cameraForBounds
    easeTo          = easeTo
    fitBounds       = fitBounds
    setStyle        = setStyle
    constructor(options: object) {
      made(options)
      if (thrown.value) throw thrown.value
    }
    getCenter()    { return { lat: 0, lng: 0 } }
    getContainer() { return { clientHeight: 600, clientWidth: 800 } }
    getZoom()      { return 5 }
    project()      { return corner }
    on(type: string, run: (event: unknown) => void) { handlers.set(type, [...handlers.get(type) ?? [], run]) }
    querySourceFeatures(_: string, { sourceLayer }: { sourceLayer: string }) {
      queried(sourceLayer)
      return sourceLayer === 'place'
        ? [{
            geometry   : { coordinates: [TOWN, 0], type: 'Point' },
            properties : { class: 'city', name: 'Town' }
          }]
        : []
    }
    remove()       {}
  },
  getVersion   : () => VERSION,
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
vi.mock('vitepress', () => ({ useData: () => ({ isDark: DARK.scheme }) }))
vi.mock('../../../docs/.vitepress/lib/map/credit.ts', () => ({ Credit: class { follow = vi.fn() } }))
vi.mock('../../../docs/.vitepress/lib/map/overlay.ts', async () => {
  const { View } = await import('../../../docs/.vitepress/lib/map/mercator.ts')
  return {
    Overlay: class {
      covered    = () => [] as unknown[]
      draw       = draw
      gather     = gather
      invalidate = invalidate
      labels     = [] as unknown[]
      onMap      = new Uint16Array()
      scheme     = null as unknown
      view       = new View()
      constructor(_lower: unknown, _upper: unknown, state: typeof drawn.state) {
        drawn.overlay = this
        drawn.state   = state
      }
      crossing() { return new Uint8Array(1) }
      nearest()  { return null }
      resize()   {}
    }
  }
})

enableAutoUnmount(afterEach)

/**
 * Runs every listener the map holds for `type` with `event`.
 */
const fire = (type: string, event: unknown = {}) => handlers.get(type)?.forEach(run => run(event))

/**
 * Returns how many reads of the map's tiles asked for the names of places.
 */
const placeReads = () => queried.mock.calls.filter(([layer]) => layer === 'place').length

/**
 * Mounts the map over a fresh copy of the shared state holding one pass on the
 * horizon and a stand-in worker, its frame 600 pixels tall, with its
 * stylesheet already linked, the map's constructor throwing `error` where one
 * is given, its `props` set, every error the mount raises passed to `caught`,
 * and the device scheme it follows held in `dark`.
 */
const mounted = async (error: Error | null = null, props = {}) => {
  const dark   = ref(false)
  thrown.value = error
  DARK.scheme  = dark
  caught.mockClear()
  handlers.clear()
  const turn = stubMatchMedia(() => false)
  vi.stubGlobal('requestAnimationFrame', frame)
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } })
  document.head.append(
    Object.assign(document.createElement('link'), { href: SHEETS.map.hrefOf(VERSION), rel: 'stylesheet' })
  )
  const { component: SkyMap, sky } = await freshSky(() => import('../../../docs/.vitepress/theme/SkyMap.tsx'))
  const wrapper                    = mount(SkyMap, { global: { config: { errorHandler: caught } }, props })
  await flushPromises()
  const pass                       = passOf(1)
  sky.tracks.add([pass], new Float32Array(2 * TRACK_WIDTH), Uint32Array.of(0), 2)
  cameraForBounds.mockClear()
  easeTo.mockClear()
  return { SkyMap, dark, pass, sky, turn, wrapper }
}

it('hands the overlay the kinds shown as they are switched', async () => {
  const { sky } = await mounted()
  sky.trace(['earth'])
  expect(drawn.state.kinds).toMatchObject({ crewed: false, earth: true })
})

it('restyles the map and its overlay in the night scheme once the device turns dark', async () => {
  const { dark } = await mounted()
  setStyle.mockClear()
  invalidate.mockClear()
  dark.value = true
  await flushPromises()
  const ground = expect.objectContaining({ id: 'ground', paint: { 'background-color': SCHEMES.night.page } })
  expect([setStyle.mock.lastCall, drawn.overlay.scheme, invalidate.mock.calls.length]).toEqual([
    [expect.objectContaining({ layers: expect.arrayContaining([ground]) })], SCHEMES.night, 1
  ])
})

it('has the credit follow the lines of the map it makes', async () => {
  const { sky } = await mounted()
  expect(sky.credit.follow).toHaveBeenCalledOnce()
})

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
  ['leaves a pinned pass in place on a wider page while its whole crossing shows', { x: 400, y: 300 }, []],
  ['fits a pinned pass on a wider page once its crossing runs past the margin', { x: 30, y: 300 },
    [{ maxZoom: 5, padding: { bottom: 48, left: 48, right: 48, top: 48 } }]]
])('%s', async (_, at, fits) => {
  const { pass, sky } = await mounted()
  Object.assign(corner, at)
  onTestFinished(() => { Object.assign(corner, { x: 400, y: 300 }) })
  fitBounds.mockClear()
  sky.pin(pass)
  await flushPromises()
  expect(fitBounds.mock.calls.map(([, options]) => options)).toEqual(fits)
})

it.each([
  ['centers the zoom buttons in the map above the sheet', 330, '330px'],
  ['centers the zoom buttons in the whole map where no sheet covers it', 0, '0px']
])('%s', async (_, covered, bottom) => {
  const { sky, wrapper } = await mounted()
  sky.covered.value      = covered
  await flushPromises()
  expect(wrapper.get('[aria-label="Zoom"]').element.parentElement!.style.bottom).toBe(bottom)
})

it('holds the zoom buttons one inset from the map’s right edge', async () => {
  const { wrapper } = await mounted()
  expect(wrapper.find('.right-inset [aria-label="Zoom"]').exists()).toBe(true)
})

it('sets the zoom buttons side by side where the map above the sheet stands under 6rem tall', async () => {
  const { wrapper } = await mounted()
  const group       = wrapper.get('[aria-label="Zoom"]')
  expect([group.element.parentElement!.classList.contains('@container-size'), group.classes()])
    .toEqual([true, expect.arrayContaining(['[@container(height<6rem)]:flex-row'])])
})

it.each([
  ['answers the pointer and holds its zoom buttons, spot, names, and sky as the home map', {},
    [true, true, true, true, 'crosshair', 1, 1]],
  ['holds still as a backdrop, with no zoom buttons, spot, names, sky, or answer to the pointer',
    { backdrop: true }, [false, false, false, false, 'auto', 0, 0]],
  ['draws the sky as a backdrop once it goes live', { backdrop: true, live: true },
    [false, false, false, false, 'auto', 0, 1]]
])('%s', async (_, props, answers) => {
  const { wrapper } = await mounted(null, props)
  vi.useFakeTimers()
  fire('idle')
  vi.runAllTimers()
  vi.useRealTimers()
  expect([
    made.mock.lastCall![0].interactive,
    handlers.has('click'),
    wrapper.find('[aria-label="Zoom"]').exists(),
    drawn.state.spot !== null,
    (wrapper.get('[data-map]').element as HTMLElement).style.cursor,
    drawn.overlay.labels.length,
    drawn.state.tracks.passes.length
  ]).toEqual(answers)
})

it.each([
  ['once the map rests 200 ms after a run of moves', ['moveend', 'movestart', 'moveend'], [0, 1]],
  ['never while a move starts within 200 ms of the last', ['moveend', 'movestart'], [0, 0]],
  ['once after the tiles in view load', ['idle'], [0, 1]]
])('reads and draws the names in view %s', async (_, events, reads) => {
  await mounted()
  vi.useFakeTimers()
  queried.mockClear()
  for (const type of events) {
    fire(type)
    vi.advanceTimersByTime(199)
  }
  const before = placeReads()
  invalidate.mockClear()
  vi.advanceTimersByTime(1)
  const after  = placeReads()
  vi.useRealTimers()
  expect([before, after, invalidate.mock.calls.length]).toEqual([...reads, reads[1] - reads[0]])
})

it('links the map sheet itself where the page holds only its preload, '
 + 'building the map once it loads', async () => {
  const href = SHEETS.map.hrefOf(VERSION)
  await mounted()
  document.head.replaceChildren(
    Object.assign(document.createElement('link'), { as: 'style', href, rel: 'preload' })
  )
  const { component: SkyMap } = await freshSky(() => import('../../../docs/.vitepress/theme/SkyMap.tsx'))
  made.mockClear()
  mount(SkyMap)
  await flushPromises()
  const linked = [...document.head.querySelectorAll<HTMLLinkElement>(`link[href="${href}"]`)]
  expect([linked.map(link => link.rel), made.mock.calls.length]).toEqual([['preload', 'stylesheet'], 1])
})

it('builds the map without its sheet where the sheet fails to load', async () => {
  await mounted()
  document.head.replaceChildren()
  const { component: SkyMap } = await freshSky(() => import('../../../docs/.vitepress/theme/SkyMap.tsx'))
  vi.spyOn(document.head, 'append').mockImplementationOnce(link =>
    queueMicrotask(() => (link as HTMLLinkElement).dispatchEvent(new Event('error'))))
  made.mockClear()
  mount(SkyMap)
  await flushPromises()
  expect(made).toHaveBeenCalledOnce()
})

it.each([
  ['moves to the spot a changed address names', {}, { latitude: 48.86, longitude: 2.29 }],
  ['leaves the spot as a backdrop', { backdrop: true }, { latitude: 42.36, longitude: -71.06 }]
])('%s', async (_, props, spot) => {
  const { sky } = await mounted(null, props)
  history.replaceState(null, '', `${location.pathname}#48.86,2.29`)
  window.dispatchEvent(new Event('hashchange'))
  expect(sky.spot.value).toEqual(spot)
})

it('lets the pinned pass go on a press of the empty map', async () => {
  const { pass, sky } = await mounted()
  sky.pin(pass)
  fire('click', { point: { x: 10, y: 10 } })
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

it('eases the map under the opening chooser’s pin over MapLibre’s own duration', async () => {
  const { sky } = await mounted()
  easeTo.mockClear()
  sky.choose()
  await flushPromises()
  const { latitude, longitude } = sky.spot.value
  expect(easeTo.mock.calls).toStrictEqual([[{ center: [longitude, latitude], offset: [0, -0] }]])
})

it('pulls the pin onto a town 10 px away once the map rests', async () => {
  const { sky } = await mounted()
  sky.choose()
  await flushPromises()
  fire('moveend')
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
  fire('moveend')
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

it.each([
  ['on the horizon only the step fitting its whole crossing', 0, 1],
  ['at the steep elevation only the step fitting its whole crossing', STEEP, 1],
  ['one degree past it the step into its high stretch as well', STEEP + 1, 2]
] as const)('gives a pass held %s', async (_, elevation, steps) => {
  const { sky } = await mounted()
  const pass    = passOf(2)
  sky.tracks.add([pass], new Float32Array(2 * TRACK_WIDTH).fill(elevation), Uint32Array.of(0), 2)
  sky.selected.value = pass
  sky.done.value     = true
  await flushPromises()
  expect(cameraForBounds).toHaveBeenCalledTimes(steps)
})

it('takes the spot into the high stretch of a pass climbing past STEEP', async () => {
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
  ['a lost context fails to come back', null, () => fire('error', { error: new GPU() })]
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
    fire('error', { error: new GPU() })
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
  fire('error', { error: new Error('Failed to fetch'), sourceId: 'base' })
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
  fire('error', { error: new GPU() })
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

it('keeps names out of the zoom buttons, reading each marked panel’s box', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ bottom: 120, height: 100, left: 20, right: 70, top: 20, width: 50 } as DOMRect)
  const { wrapper } = await mounted()
  expect([wrapper.get('[aria-label="Zoom"]').attributes('data-label-clear'), drawn.overlay.covered()])
    .toEqual(['true', [{ bottom: 100, left: 0, right: 50, top: 0 }]])
  vi.restoreAllMocks()
})

it('places the names again once the sheet covers more of the map', async () => {
  const { sky } = await mounted()
  invalidate.mockClear()
  sky.covered.value = 200
  await flushPromises()
  expect(invalidate).toHaveBeenCalledOnce()
})

it('observes a panel beside the map once the page turns to a phone’s width, but no zoom button', async () => {
  const resized = { run: () => {}, targets: [] as Element[] }
  vi.stubGlobal('ResizeObserver', class {
    constructor(run: () => void) { resized.run = run }
    disconnect() {}
    observe(target: Element) { resized.targets.push(target) }
  })
  const { turn, wrapper } = await mounted()
  const panel             = document.createElement('div')
  panel.toggleAttribute('data-label-clear')
  wrapper.element.parentElement!.append(panel)
  turn(true)
  await flushPromises()
  invalidate.mockClear()
  resized.run()
  expect([resized.targets, invalidate.mock.calls.length]).toEqual([[panel], 1])
})
