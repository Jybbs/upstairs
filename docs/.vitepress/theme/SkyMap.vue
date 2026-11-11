<script setup lang="ts">
import mlcontour                                            from 'maplibre-contour'
import * as maplibregl                                      from 'maplibre-gl'
import mapStyle                                             from 'maplibre-gl/dist/maplibre-gl.css?url'
import mapWorker                                            from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useData }                                          from 'vitepress'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { CREDITS, holdCredit } from '../lib/map/credit.ts'
import { namesOn, placeNear }  from '../lib/map/places.ts'
import { Overlay }             from '../lib/map/overlay.ts'
import { styleOf }             from '../lib/map/style.ts'
import { SCHEMES }             from '../lib/site/palette.ts'
import { sky }                 from '../lib/state/sky.ts'

const DEM     = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'
const SYNC_MS = 250
const ZOOM    = 5
const cursor  = ref('crosshair')
const frame   = ref<HTMLElement>()
const lower   = ref<HTMLCanvasElement>()
const upper   = ref<HTMLCanvasElement>()

const { isDark } = useData()
const scheme     = computed(() => SCHEMES[isDark.value ? 'night' : 'day'])

let contourTiles: string
let demTiles: string
let map: maplibregl.Map
let overlay: Overlay
let request = 0

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
  overlay.labels = namesOn(map, overlay.view)
  sky.inFrame.value = overlay.crossing(sky.tracks)
  overlay.invalidate()
}

/**
 * Links the map's stylesheet from the page's head once, resolving once it has
 * loaded.
 */
const styled = () => new Promise(resolve => {
  if (document.querySelector(`link[href="${mapStyle}"]`)) return resolve(null)
  const link = Object.assign(document.createElement('link'), { href: mapStyle, rel: 'stylesheet' })
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
    maxZoom            : 12,
    minZoom            : 1.5,
    pitchWithRotate    : false,
    style              : styleOf(contourTiles, demTiles, scheme.value),
    zoom               : ZOOM
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  holdCredit(map)

  overlay = new Overlay(lower.value!, upper.value!, () => ({
    selected : sky.selected.value,
    spot     : sky.spot.value,
    traced   : sky.traces,
    tracks   : sky.tracks
  }))
  overlay.scheme = scheme.value
  fit()

  map.on('move', placed)
  map.on('moveend', refreshFrame)
  map.on('idle', refreshFrame)
  map.on('resize', fit)
  map.on('mousemove', ({ point }) => {
    cursor.value = overlay.nearest(point.x, point.y) === null ? 'crosshair' : 'pointer'
  })
  map.on('click', ({ point, lngLat }) => {
    const pass = overlay.nearest(point.x, point.y)
    if (pass !== null) {
      sky.selected.value = sky.tracks.passes[pass].id
      return
    }
    sky.pick(
      { latitude: lngLat.lat, longitude: lngLat.wrap().lng },
      placeNear(overlay.labels, lngLat.lat, lngLat.lng, overlay.view)
    )
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
    }
    request = requestAnimationFrame(loop)
  }
  request = requestAnimationFrame(loop)
  document.fonts.ready.then(() => overlay.invalidate())
})

watch(sky.version, () => {
  if (!overlay) return
  overlay.invalidate()
  if (sky.done.value) sky.inFrame.value = overlay.crossing(sky.tracks)
})
watch([sky.selected, sky.lowest, () => ({ ...sky.traced })], () => overlay?.invalidate())
watch(scheme, value => {
  if (!overlay) return
  map.setStyle(styleOf(contourTiles, demTiles, value))
  overlay.scheme = value
  overlay.invalidate()
})
watch(sky.spot, ({ latitude, longitude }) => {
  const center = map.getCenter()
  if (Math.abs(center.lat - latitude) + Math.abs(center.lng - longitude) > 0.001) {
    map.flyTo({ center: [longitude, latitude], duration: 900, essential: false })
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(request)
  map?.remove()
})
</script>

<template>
  <div class="absolute inset-0 overflow-hidden bg-page" :style="{ cursor }">
    <div ref="frame" class="size-full [&_.maplibregl-canvas]:cursor-[inherit]!" />
    <canvas ref="lower" class="pointer-events-none absolute inset-0 size-full" />
    <canvas ref="upper" class="pointer-events-none absolute inset-0 size-full" />
  </div>
</template>
