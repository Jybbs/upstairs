<script setup lang="ts">
import mlcontour from 'maplibre-contour'
import * as maplibregl from 'maplibre-gl'
import mapWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { namesOn, placeNear } from '../map/places.ts'
import { Overlay } from '../map/overlay.ts'
import { styleOf } from '../map/style.ts'
import { sky } from '../state/sky.ts'

const DEM     = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'
const SYNC_MS = 250
const ZOOM    = 5

const frame  = ref<HTMLElement>()
const lower  = ref<HTMLCanvasElement>()
const upper  = ref<HTMLCanvasElement>()
const cursor = ref('crosshair')

let map: maplibregl.Map
let overlay: Overlay
let request = 0

const tracedAt = (pass: number) => !sky.tracks.docked.has(pass) && sky.traced[sky.tracks.passes[pass].kind] && sky.tracks.passes[pass].peak >= sky.lowest.value

const placed = () => {
  const center = map.getCenter()
  overlay.view.set(map.getContainer().clientWidth, map.getContainer().clientHeight, map.getZoom(), center.lng, center.lat)
  overlay.invalidate()
}

const refreshFrame = () => {
  overlay.labels = namesOn(map, overlay.view)
  sky.inFrame.value = overlay.crossing(sky.tracks)
  overlay.invalidate()
}

const fit = () => {
  const { clientWidth, clientHeight } = frame.value!
  overlay.resize(clientWidth, clientHeight, devicePixelRatio)
  placed()
}

onMounted(() => {
  maplibregl.setWorkerUrl(mapWorker)
  const demSource = new mlcontour.DemSource({ url: DEM, encoding: 'terrarium', maxzoom: 13, worker: true })
  demSource.setupMaplibre(maplibregl)
  const contourTiles = demSource.contourProtocolUrl({
    multiplier   : 1,
    thresholds   : { 2: [1000, 2000], 5: [500, 1000], 7: [200, 1000], 9: [100, 500], 11: [50, 200], 12: [20, 100] },
    contourLayer : 'contours',
    elevationKey : 'ele',
    levelKey     : 'level',
    overzoom     : 1,
  })
  const { latitude, longitude } = sky.spot.value
  map = new maplibregl.Map({
    container          : frame.value!,
    style              : styleOf(demSource.sharedDemProtocolUrl, contourTiles),
    center             : [longitude, latitude],
    zoom               : ZOOM,
    minZoom            : 1.5,
    maxZoom            : 12,
    dragRotate         : false,
    pitchWithRotate    : false,
    attributionControl : { compact: true, customAttribution: 'Terrain: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen and its sources</a>' },
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()

  overlay = new Overlay(lower.value!, upper.value!, () => ({
    tracks   : sky.tracks,
    spot     : sky.spot.value,
    traced   : tracedAt,
    selected : sky.selected.value,
  }))
  fit()

  map.once('load', () => {
    const credit = map.getContainer().querySelector('.maplibregl-ctrl-attrib')
    credit?.classList.remove('maplibregl-compact-show')
    credit?.removeAttribute('open')
  })
  map.on('move', placed)
  map.on('moveend', refreshFrame)
  map.on('idle', refreshFrame)
  map.on('resize', fit)
  map.on('mousemove', ({ point }) => { cursor.value = overlay.nearest(point.x, point.y) === null ? 'crosshair' : 'pointer' })
  map.on('click', ({ point, lngLat }) => {
    const pass = overlay.nearest(point.x, point.y)
    if (pass !== null) { sky.selected.value = sky.tracks.passes[pass].id; return }
    sky.pick({ latitude: lngLat.lat, longitude: lngLat.wrap().lng }, placeNear(overlay.labels, overlay.view, lngLat.lng, lngLat.lat))
  })

  let last = performance.now(), synced = 0
  const loop = (now: number) => {
    sky.advance((now - last) / 1000)
    last = now
    overlay.draw(sky.seconds)
    if (now - synced > SYNC_MS) { synced = now; sky.tally() }
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
watch(sky.spot, ({ latitude, longitude }) => {
  const center = map.getCenter()
  if (Math.abs(center.lat - latitude) + Math.abs(center.lng - longitude) > 0.001) map.flyTo({ center: [longitude, latitude], duration: 900, essential: false })
})

onBeforeUnmount(() => { cancelAnimationFrame(request); map?.remove() })
</script>

<template>
  <div class="absolute inset-0 overflow-hidden bg-[#dbe1ee]" :style="{ cursor }">
    <div ref="frame" class="size-full [&_.maplibregl-canvas]:cursor-[inherit]!" />
    <canvas ref="lower" class="pointer-events-none absolute inset-0 size-full" />
    <canvas ref="upper" class="pointer-events-none absolute inset-0 size-full" />
  </div>
</template>
