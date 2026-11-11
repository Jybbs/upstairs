<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import mlcontour            from 'maplibre-contour'
import * as maplibregl      from 'maplibre-gl'
import mapWorker            from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useData }          from 'vitepress'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { CREDITS, holdCredit }        from '../lib/map/credit.ts'
import { DETENT, Detents, type Step } from '../lib/map/detents.ts'
import { Hosts }                      from '../lib/map/hosts.ts'
import { namesOn, placeNear }         from '../lib/map/places.ts'
import { numeralIn }                  from '../lib/map/numeral.ts'
import { Overlay }                    from '../lib/map/overlay.ts'
import { styleOf }                    from '../lib/map/style.ts'
import { TRACK_STEP, type Pass }      from '../lib/orbit/scan.ts'
import { clamp }                      from '../lib/site/motion.ts'
import { SCHEMES }                    from '../lib/site/palette.ts'
import { SHEETS }                     from '../lib/site/sheets.ts'
import { sky }                        from '../lib/state/sky.ts'
import Icon                           from './Icon.vue'

const DEM     = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'
const FLY_MS  = 900
const HIGH    = 30
const PADDING = 48
const PULL_MS = 120
const SYNC_MS = 250
const ZOOM    = 5
const cursor  = ref('crosshair')
const detents = new Detents()
const frame   = ref<HTMLElement>()
const hosts   = new Hosts()
const lifted  = ref(false)
const lower   = ref<HTMLCanvasElement>()
const pin     = ref<{ x: number, y: number } | null>(null)
const upper   = ref<HTMLCanvasElement>()

const { isDark } = useData()
const scheme     = computed(() => SCHEMES[isDark.value ? 'night' : 'day'])

let contourTiles: string
let demTiles: string
let map: maplibregl.Map
let overlay: Overlay
let request = 0

/**
 * Returns the bounds of a pass's stretch above `HIGH` degrees beside the spot,
 * and of its whole crossing.
 */
const boundsOf = (pass: Pass) => {
  const index                   = sky.tracks.passes.indexOf(pass)
  const { latitude, longitude } = sky.spot.value
  const high                    = new maplibregl.LngLatBounds([longitude, latitude], [longitude, latitude])
  const whole                   = new maplibregl.LngLatBounds()
  for (let at = pass.riseAt; at <= pass.setAt; at += TRACK_STEP) {
    if (!sky.tracks.at(index, at)) continue
    whole.extend([sky.tracks.longitude, sky.tracks.latitude])
    if (sky.tracks.elevation > HIGH) high.extend([sky.tracks.longitude, sky.tracks.latitude])
  }
  return { high, whole }
}

/**
 * Returns the chosen pass's two steps: the camera standing back until the
 * stretch above `HIGH` degrees lies beside the spot, and the camera fitting
 * the whole crossing.
 */
const stepsOf = (pass: Pass): Step[] => {
  const { high, whole } = boundsOf(pass)
  return [high, whole].flatMap(bounds => {
    const camera = !bounds.isEmpty() && map.cameraForBounds(bounds, { padding: PADDING })
    if (!camera || camera.zoom === undefined) return []
    const { lat, lng } = maplibregl.LngLat.convert(camera.center!)
    return [{ latitude: lat, longitude: lng, zoom: camera.zoom }]
  })
}

/**
 * Turns the wheel through the chosen pass's detents, zooming about the pointer
 * between them and drawing the map onto a step as the zoom nears it.
 */
const wheel = (event: WheelEvent) => {
  if (!detents.steps.length) return
  event.preventDefault()
  event.stopPropagation()
  const delta  = -event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 40 : 1) / DETENT.wheel
  const turned = detents.turn(map.getZoom(), delta)
  if (!turned) return
  if ('step' in turned) {
    const { latitude, longitude, zoom } = turned.step
    return map.jumpTo({ center: [longitude, latitude], zoom })
  }
  const { left, top } = frame.value!.getBoundingClientRect()
  const around        = map.unproject([event.clientX - left, event.clientY - top])
  map.easeTo({ around, duration: 0, zoom: turned.zoom })
  const pull = detents.pullAt(map.getZoom())
  if (!pull) return
  const { lat, lng } = map.getCenter()
  map.jumpTo({ center: [
    lng + (pull.step.longitude - lng) * pull.share,
    lat + (pull.step.latitude - lat) * pull.share
  ] })
}

/**
 * Zooms as Minus and Plus do, onto the chosen pass's next step that way, or by
 * a doubling about the map's center where no step stands that way.
 */
const zoomBy = (sign: 1 | -1) => {
  const step = detents.next(map.getZoom(), sign)
  if (!step) return map.easeTo({ zoom: map.getZoom() + sign })
  map.easeTo({ center: [step.longitude, step.latitude], zoom: step.zoom })
}

/**
 * Takes Minus and Plus from the map's own keyboard handler, so the keys take
 * the same steps as the zoom pair.
 */
const keyed = (event: KeyboardEvent) => {
  const sign = { '+': 1, '-': -1, '=': 1, '_': -1 }[event.key] as 1 | -1 | undefined
  if (!sign || event.ctrlKey || event.metaKey) return
  event.stopPropagation()
  zoomBy(sign)
}

/**
 * Returns the point of the frame the chooser's pin stands on, centered over
 * the map above the chooser's sheet.
 */
const pinPoint = (): [number, number] => {
  const { clientHeight, clientWidth } = map.getContainer()
  return [clientWidth / 2, (clientHeight - sky.raised.value) / 2]
}

/**
 * Eases the map to set a spot under the chooser's pin.
 */
const aimAt = (longitude: number, latitude: number, duration?: number) =>
  map.easeTo({ center: [longitude, latitude], duration, offset: [0, -sky.raised.value / 2] })

/**
 * Eases the map back to the spot.
 */
const home = () => {
  const { latitude, longitude } = sky.spot.value
  map.easeTo({ center: [longitude, latitude] })
}

/**
 * Moves the pin with the map, holding it still over the sheet while the
 * chooser is open and the spot under it moves, and riding the spot it set
 * while the map lands there.
 */
const aimed = () => {
  if (sky.choosing.value === 'shut') return
  if (sky.choosing.value === 'open') {
    const { lat, lng } = map.unproject(pinPoint())
    sky.aim.value      = { place: null, spot: { latitude: lat, longitude: lng } }
  }
  const { latitude, longitude } = sky.aim.value!.spot
  pin.value                     = map.project([longitude, latitude])
}

/**
 * Sets the pin down once the map rests, pulling the map onto a town within
 * reach of it, and shuts the chooser once the map has landed on the spot it
 * set.
 */
const rested = () => {
  lifted.value = false
  if (sky.choosing.value === 'landing') return void (sky.choosing.value = 'shut')
  if (sky.choosing.value !== 'open') return
  const [x, y] = pinPoint()
  const near   = placeNear(overlay.labels, x, y, overlay.view)
  if (!near) return
  const town   = near.label
  if (near.distance > 0.5) return aimAt(town.longitude, town.latitude, PULL_MS)
  sky.aim.value = { place: town.name, spot: { latitude: town.latitude, longitude: town.longitude } }
}

useEventListener(frame, 'wheel', wheel, { capture: true, passive: false })
useEventListener(frame, 'keydown', keyed, { capture: true })

const fit = () => {
  const { clientWidth, clientHeight } = frame.value!
  overlay.resize(clientWidth, clientHeight, devicePixelRatio)
  placed()
}

const placed = () => {
  const center                      = map.getCenter()
  const { clientWidth, clientHeight } = map.getContainer()
  overlay.view.set(clientWidth, clientHeight, map.getZoom(), center.lng, center.lat)
  overlay.invalidate()
}

const refreshFrame = () => {
  overlay.labels    = namesOn(map, overlay.view)
  sky.inFrame.value = overlay.crossing(sky.tracks)
  sky.unlatch()
  overlay.invalidate()
}

/**
 * Links the map's stylesheet from the page's head once, resolving once it has
 * loaded.
 */
const styled = () => new Promise(resolve => {
  const { href } = SHEETS.map
  if (document.querySelector(`link[href="${href}"]`)) return resolve(null)
  const link = Object.assign(document.createElement('link'), { href, rel: 'stylesheet' })
  link.onload = resolve
  document.head.append(link)
})

onMounted(async () => {
  await styled()
  if (!frame.value) return
  maplibregl.setWorkerUrl(mapWorker)
  const demSource = new mlcontour.DemSource({ encoding: 'terrarium', maxzoom: 13, url: DEM, worker: true })
  demSource.setupMaplibre(maplibregl)
  demTiles     = demSource.sharedDemProtocolUrl
  contourTiles = demSource.contourProtocolUrl({
    contourLayer : 'contours',
    elevationKey : 'ele',
    levelKey     : 'level',
    multiplier   : 1,
    overzoom     : 1,
    thresholds   : {
      2  : [1000, 2000],
      5  : [500, 1000],
      7  : [200, 1000],
      9  : [100, 500],
      11 : [50, 200],
      12 : [20, 100]
    }
  })
  const { latitude, longitude } = sky.spot.value
  map                           = new maplibregl.Map({
    attributionControl : { compact: true, customAttribution: CREDITS },
    center             : [longitude, latitude],
    container          : frame.value!,
    dragRotate         : false,
    maxPitch           : 0,
    maxZoom            : 12,
    minZoom            : 1.5,
    pitchWithRotate    : false,
    style              : styleOf(contourTiles, demTiles, scheme.value),
    touchPitch         : false,
    zoom               : ZOOM
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  holdCredit(map)

  overlay = new Overlay(lower.value!, upper.value!, {
    get gathered() { return sky.gather.value !== null },
    get held() { return sky.shown.value },
    get named() { return sky.named.value },
    reduced : sky.reduced,
    get selected() { return sky.selected.value },
    get spot() { return sky.spot.value },
    get start() { return sky.start.value },
    traced  : sky.traces,
    tracks  : sky.tracks
  })
  overlay.scheme = scheme.value
  fit()

  map.on('error', ({ sourceId }: maplibregl.ErrorEvent & { sourceId?: string }) => hosts.fail(sourceId))
  map.on('sourcedata', ({ sourceId, tile }) => tile && hosts.load(sourceId))
  map.on('move', placed)
  map.on('move', aimed)
  map.on('movestart', () => { lifted.value = sky.choosing.value === 'open' })
  map.on('moveend', refreshFrame)
  map.on('moveend', rested)
  map.on('idle', refreshFrame)
  map.on('resize', fit)
  map.on('mousemove', ({ point }) => {
    if (sky.choosing.value !== 'shut') return void (cursor.value = 'grab')
    cursor.value = overlay.nearest(point.x, point.y) === null ? 'crosshair' : 'pointer'
  })
  map.on('click', ({ point }) => {
    if (sky.choosing.value !== 'shut') return
    const pass = overlay.nearest(point.x, point.y)
    if (pass === null) return sky.release()
    sky.pin(sky.tracks.passes[pass])
  })

  let last   = performance.now()
  let synced = 0
  const loop = (now: number) => {
    sky.advance((now - last) / 1000)
    last = now
    overlay.draw(sky.seconds)
    if (now - synced > SYNC_MS) {
      synced = now
      sky.tally()
      sky.latch(overlay.onMap)
    }
    request = requestAnimationFrame(loop)
  }
  request = requestAnimationFrame(loop)
  stepped()
  document.fonts.ready.then(() => overlay.invalidate())
})

/**
 * Sets the detents to the chosen pass's steps once its scan is done.
 */
const stepped = () => {
  const focus = sky.focus.value
  if (map) detents.set(focus && sky.done.value ? stepsOf(focus) : [])
}

/**
 * Gives each pass its point in the numeral while the sky is gathered.
 */
const regather = () => {
  const room = sky.gather.value
  if (room) overlay?.gather(sky.tracks, sky.seconds, count => numeralIn(room, count))
}

watch(sky.version, () => {
  if (!overlay) return
  overlay.invalidate()
  if (sky.done.value) sky.inFrame.value = overlay.crossing(sky.tracks)
  regather()
})
watch([sky.focus, sky.done], stepped)
watch(scheme, value => {
  if (!overlay) return
  map.setStyle(styleOf(contourTiles, demTiles, value))
  overlay.scheme = value
  overlay.invalidate()
})
watch(sky.spot, ({ latitude, longitude }) => {
  if (!map || sky.choosing.value !== 'shut') return
  const center = map.getCenter()
  if (Math.abs(center.lat - latitude) + Math.abs(center.lng - longitude) > 0.001) {
    map.flyTo({ center: [longitude, latitude], duration: FLY_MS, essential: false })
  }
})
watch([sky.choosing, sky.raised], ([choosing], [was]) => {
  if (!map) return
  const { latitude, longitude } = choosing === 'open' ? sky.aim.value!.spot : sky.spot.value
  if (choosing === 'open') return aimAt(longitude, latitude)
  if (choosing === 'landing') return map.easeTo({ center: [longitude, latitude], duration: FLY_MS })
  pin.value = null
  if (was === 'open') home()
})
watch(sky.gather, regather)
watch([sky.pinned, sky.covered], ([pass, covered], [was]) => {
  if (!map || !covered) return
  const edge    = clamp((map.getContainer().clientHeight - covered) / 4, 0, PADDING)
  const padding = { bottom: covered + edge, left: PADDING, right: PADDING, top: edge }
  if (pass) return map.fitBounds(boundsOf(pass).whole, { maxZoom: map.getZoom(), padding })
  if (was) home()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(request)
  map?.remove()
  sky.choosing.value = 'shut'
})
</script>

<template>
  <div class="absolute inset-0 overflow-hidden bg-page" :style="{ cursor }" data-map>
    <div ref="frame" class="size-full [&_.maplibregl-canvas]:cursor-[inherit]!" />
    <div
      v-if="pin"
      class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full text-ink"
      :style="{ left: `${pin.x}px`, top: `${pin.y}px` }"
      aria-hidden="true"
    >
      <span
        class="absolute -bottom-1 left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-full bg-ink/30
               transition-opacity motion-reduce:hidden"
        :class="lifted ? 'opacity-100' : 'opacity-0'"
      />
      <Icon
        :key="String(lifted)"
        name="drop"
        :size="32"
        class="block transition-transform duration-140 [filter:drop-shadow(0_0_1.5px_var(--page))]
               motion-reduce:transition-none"
        :class="lifted ? 'motion-safe:-translate-y-2.5' : 'motion-safe:animate-land'"
      />
    </div>
    <div
      class="absolute top-1/2 right-3 z-10 flex -translate-y-1/2 flex-col overflow-hidden rounded-sm border
             border-rule bg-panel/95 text-ink shadow-lift [&>button]:grid [&>button]:size-11
             [&>button]:cursor-pointer [&>button]:place-items-center [&>button:hover]:bg-lift"
      role="group"
      aria-label="Zoom"
    >
      <button type="button" aria-label="Zoom in" @click="zoomBy(1)"><Icon name="zin" /></button>
      <button type="button" class="border-t border-rule" aria-label="Zoom out" @click="zoomBy(-1)">
        <Icon name="zout" />
      </button>
    </div>
    <div v-if="hosts.message.value" class="pointer-events-none absolute inset-0 bg-panel/62" />
    <canvas ref="lower" class="pointer-events-none absolute inset-0 size-full" />
    <canvas ref="upper" class="pointer-events-none absolute inset-0 size-full" />
    <div
      v-if="hosts.message.value"
      class="pointer-events-none absolute inset-0 grid items-end justify-items-center p-6 pb-[8%]
             xl:pl-[calc(var(--spacing-readout)+--spacing(8))]"
    >
      <p
        class="caps max-w-[24ch] border-y-[1.5px] border-ink bg-panel/88 px-3 py-2.5 text-center text-sm!
               text-ink"
        role="alert"
      >
        {{ hosts.message.value }}
      </p>
    </div>
  </div>
</template>
