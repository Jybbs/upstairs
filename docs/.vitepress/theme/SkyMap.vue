<script setup lang="ts">
import mlcontour                                  from 'maplibre-contour'
import * as maplibregl                            from 'maplibre-gl'
import mapStyle                                   from 'maplibre-gl/dist/maplibre-gl.css?url'
import mapWorker                                  from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { Hosts }              from '../lib/map/hosts.ts'
import { namesOn, placeNear } from '../lib/map/places.ts'
import { Overlay }            from '../lib/map/overlay.ts'
import { styleOf }            from '../lib/map/style.ts'
import { sky }                from '../lib/state/sky.ts'

const CREDIT = 'Terrain: <a '
             + 'href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen and its '
             + 'sources</a>'
const DEM      = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'
const SYNC_MS  = 250
const ZOOM     = 5
const cursor   = ref('crosshair')
const frame    = ref<HTMLElement>()
const hosts    = new Hosts()
const lower    = ref<HTMLCanvasElement>()
const upper    = ref<HTMLCanvasElement>()

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
  const contourTiles = demSource.contourProtocolUrl({
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
    attributionControl : { compact: true, customAttribution: CREDIT },
    center             : [longitude, latitude],
    container          : frame.value!,
    dragRotate         : false,
    maxPitch           : 0,
    maxZoom            : 12,
    minZoom            : 1.5,
    pitchWithRotate    : false,
    style              : styleOf(contourTiles, demSource.sharedDemProtocolUrl),
    touchPitch         : false,
    zoom               : ZOOM
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()

  overlay = new Overlay(lower.value!, upper.value!, () => ({
    selected : sky.selected.value,
    spot     : sky.spot.value,
    traced   : sky.traces,
    tracks   : sky.tracks
  }))
  fit()

  map.once('load', () => {
    const credit = map.getContainer().querySelector('.maplibregl-ctrl-attrib')
    credit?.classList.remove('maplibregl-compact-show')
    credit?.removeAttribute('open')
  })
  map.on('error', ({ sourceId }: maplibregl.ErrorEvent & { sourceId?: string }) => hosts.fail(sourceId))
  map.on('sourcedata', ({ sourceId, tile }) => tile && hosts.load(sourceId))
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
      sky.selected.value = sky.tracks.passes[pass]
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
  <div class="absolute inset-0 overflow-hidden bg-[#dbe1ee]" :style="{ cursor }">
    <div ref="frame" class="size-full [&_.maplibregl-canvas]:cursor-[inherit]!" />
    <div v-if="hosts.message.value" class="pointer-events-none absolute inset-0 bg-paper/62" />
    <canvas ref="lower" class="pointer-events-none absolute inset-0 size-full" />
    <canvas ref="upper" class="pointer-events-none absolute inset-0 size-full" />
    <div
      v-if="hosts.message.value"
      class="pointer-events-none absolute inset-0 grid items-end justify-items-center p-6 pb-[8%]
             xl:pl-[calc(var(--spacing-readout)+--spacing(8))]"
    >
      <p
        class="caps max-w-[24ch] border-y-[1.5px] border-ink bg-paper/88 px-3 py-2.5 text-center text-sm!
               text-ink"
        role="alert"
      >
        {{ hosts.message.value }}
      </p>
    </div>
  </div>
</template>
