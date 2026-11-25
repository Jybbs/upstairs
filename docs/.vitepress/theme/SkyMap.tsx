import { useEventListener, useRafFn, useResizeObserver, useTimeoutFn } from '@vueuse/core'
import mlcontour       from 'maplibre-contour'
import * as maplibregl from 'maplibre-gl'
import mapWorker       from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useData }     from 'vitepress'
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'vue'

import { DETENT, Detents, type Step } from '../lib/map/detents.ts'
import { Hosts }                      from '../lib/map/hosts.ts'
import { numeralIn }                  from '../lib/map/numeral.ts'
import { Overlay }                    from '../lib/map/overlay.ts'
import * as places                    from '../lib/map/places.ts'
import { styleOf }                    from '../lib/map/style.ts'
import * as scan                      from '../lib/orbit/scan.ts'
import { clamp }                      from '../lib/site/motion.ts'
import { SCHEMES }                    from '../lib/site/palette.ts'
import { usePhone }                   from '../lib/site/phone.ts'
import { SHEETS }                     from '../lib/site/sheets.ts'
import { sky }                        from '../lib/state/sky.ts'
import { Tracks }                     from '../lib/state/tracks.ts'
import Icon                           from './Icon.tsx'

const DEM     = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'
const FLY_MS  = 900
const PADDING = 48
const PULL_MS = 120
/**
 * How long the map rests after a move before its names are read again, the
 * 200 ms MapLibre's wheel zoom holds a move open after its last wheel event.
 */
const SETTLE_MS = 200
const SYNC_MS   = 250
const ZOOM      = 5

/**
 * The sky a backdrop draws until it goes live, holding no pass.
 */
const EMPTY = new Tracks()

/**
 * Draws the map around the spot under the satellites and their tracks, with
 * the pin of the spot chooser, the zoom buttons, and a notice where a host
 * the map reads fails, graying the map where the catalog did not load. As a
 * `backdrop` it draws the relief alone, held still, with no names, spot, or
 * zoom buttons, and no satellites until it goes `live`.
 */
export default defineComponent(
  (props: { backdrop?: boolean, live?: boolean }) => {
    const cursor  = ref(props.backdrop ? 'auto' : 'crosshair')
    const detents = new Detents()
    const frame   = ref<HTMLElement>()
    const hosts   = new Hosts()
    const lifted  = ref(false)
    const lower   = ref<HTMLCanvasElement>()
    const panels  = shallowRef<HTMLElement[]>([])
    const phone   = usePhone()
    const pin     = ref<{ x: number, y: number } | null>(null)
    const upper   = ref<HTMLCanvasElement>()

    const { isDark } = useData()
    const scheme     = computed(() => SCHEMES[isDark.value ? 'night' : 'day'])

    let contourTiles: string
    let demTiles: string
    let map: maplibregl.Map
    let overlay: Overlay
    let synced = 0

    const frames = useRafFn(({ delta, timestamp }) => {
      sky.advance(delta / 1000)
      overlay.draw(sky.seconds)
      if (timestamp - synced > SYNC_MS) {
        synced = timestamp
        sky.tally()
        sky.latch(overlay.onMap)
      }
    }, { immediate: false })

    /**
     * Marks the map as unable to draw and stops the frame loop.
     */
    const blanked = () => {
      sky.blank.value = true
      frames.pause()
    }

    /**
     * Finds the bounds of a pass's stretch above `STEEP` degrees beside the
     * spot, and of its whole crossing.
     */
    const boundsOf = (pass: scan.Pass) => {
      const index                   = sky.tracks.passes.indexOf(pass)
      const { latitude, longitude } = sky.spot.value
      const high                    = new maplibregl.LngLatBounds()
      const whole                   = new maplibregl.LngLatBounds()
      for (let at = pass.riseAt; at <= pass.setAt; at += scan.TRACK_STEP) {
        if (!sky.tracks.at(index, at)) continue
        whole.extend([sky.tracks.longitude, sky.tracks.latitude])
        if (sky.tracks.elevation > scan.STEEP) high.extend([sky.tracks.longitude, sky.tracks.latitude])
      }
      if (!high.isEmpty()) high.extend([longitude, latitude])
      return { high, whole }
    }

    /**
     * Lays out the chosen pass's steps: the camera standing back until the
     * stretch above `STEEP` degrees lies beside the spot, where the pass climbs
     * that high, and the camera fitting the whole crossing.
     */
    const stepsOf = (pass: scan.Pass): Step[] => {
      const { high, whole } = boundsOf(pass)
      return [high, whole].flatMap(bounds => {
        const camera = !bounds.isEmpty() && map.cameraForBounds(bounds, { padding: PADDING })
        if (!camera || camera.zoom === undefined) return []
        const { lat, lng } = maplibregl.LngLat.convert(camera.center!)
        return [{ latitude: lat, longitude: lng, zoom: camera.zoom }]
      })
    }

    /**
     * Turns the wheel through the chosen pass's detents, zooming about the
     * pointer between them and drawing the map onto a step as the zoom nears
     * it.
     */
    const wheel = (event: WheelEvent) => {
      if (sky.blank.value || !detents.steps.length) return
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
     * Zooms as Minus and Plus do, onto the chosen pass's next step that way, or
     * by a doubling about the map's center where no step stands that way.
     */
    const zoomBy = (sign: 1 | -1) => {
      if (sky.blank.value) return
      const step = detents.next(map.getZoom(), sign)
      if (!step) return map.easeTo({ zoom: map.getZoom() + sign })
      map.easeTo({ center: [step.longitude, step.latitude], zoom: step.zoom })
    }

    /**
     * Takes Minus and Plus from the map's own keyboard handler, so the keys
     * take the same steps as the zoom pair.
     */
    const keyed = (event: KeyboardEvent) => {
      const sign = { '+': 1, '-': -1, '=': 1, '_': -1 }[event.key] as 1 | -1 | undefined
      if (!sign || event.ctrlKey || event.metaKey) return
      event.stopPropagation()
      zoomBy(sign)
    }

    /**
     * Finds the point of the frame the chooser's pin stands on, centered over
     * the map above the chooser's sheet.
     */
    const pinPoint = (): [number, number] => {
      const { clientHeight, clientWidth } = map.getContainer()
      return [clientWidth / 2, (clientHeight - sky.raised.value) / 2]
    }

    /**
     * Eases the map to set a spot under the chooser's pin, over MapLibre's
     * default duration unless `options` names one, since `easeTo` copies an
     * explicit `undefined` over that default and eases by `NaN`.
     */
    const aimAt = (
      { latitude, longitude } : scan.Spot,
      options?                : Pick<maplibregl.EaseToOptions, 'duration'>
    ) => map.easeTo({ ...options, center: [longitude, latitude], offset: [0, -sky.raised.value / 2] })

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
      named()
      const [x, y] = pinPoint()
      const near   = places.placeNear(overlay.labels, x, y, overlay.view)
      if (!near) return
      const town   = near.label
      if (near.distance > 0.5) return aimAt(town, { duration: PULL_MS })
      sky.aim.value = { place: town.name, spot: { latitude: town.latitude, longitude: town.longitude } }
    }

    useEventListener(frame, 'wheel', wheel, { capture: true, passive: false })
    useEventListener(frame, 'keydown', keyed, { capture: true })
    if (!props.backdrop) useEventListener('hashchange', () => sky.reread())

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
      sky.inFrame.value = overlay.crossing(sky.tracks)
      sky.unlatch()
      overlay.invalidate()
    }

    /**
     * Reads the names in view off the map's tiles.
     */
    const named = () => {
      overlay.labels = props.backdrop ? [] : places.namesOn(map, overlay.view)
      overlay.invalidate()
    }

    /**
     * Reads the names once the map has rested `SETTLE_MS` after its last move,
     * a move starting meanwhile holding the read back.
     */
    const settle = useTimeoutFn(named, SETTLE_MS, { immediate: false })

    /**
     * Links the map's stylesheet from the page's head once, resolving once it
     * has loaded or failed to load, the map drawing without it after a failure.
     */
    const styled = () => new Promise(resolve => {
      const href = SHEETS.map.hrefOf(maplibregl.getVersion())
      if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return resolve(null)
      const link   = Object.assign(document.createElement('link'), { href, rel: 'stylesheet' })
      link.onerror = resolve
      link.onload  = resolve
      document.head.append(link)
    })

    onMounted(async () => {
      await styled()
      if (!frame.value) return
      maplibregl.setWorkerUrl(mapWorker)
      const demSource = new mlcontour.DemSource({
        encoding : 'terrarium',
        maxzoom  : 13,
        url      : DEM,
        worker   : true
      })
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
      sky.blank.value               = false
      try {
        map = new maplibregl.Map({
          attributionControl : false,
          center             : [longitude, latitude],
          container          : frame.value!,
          dragRotate         : false,
          interactive        : !props.backdrop,
          maxPitch           : 0,
          maxZoom            : 12,
          minZoom            : 1.5,
          pitchWithRotate    : false,
          style              : styleOf(contourTiles, demTiles, scheme.value),
          touchPitch         : false,
          zoom               : ZOOM
        })
      } catch (error) {
        if (!(error instanceof maplibregl.GPUInitializationError)) throw error
        return blanked()
      }
      map.touchZoomRotate.disableRotation()
      map.keyboard.disableRotation()
      sky.credit.follow(map)

      overlay = new Overlay(lower.value!, upper.value!, {
        get gathered() { return sky.gather.value !== null },
        get held() { return sky.shown.value },
        kinds   : toRaw(sky.traced),
        get named() { return sky.named.value },
        reduced : sky.reduced,
        get selected() { return sky.selected.value },
        get spot() { return props.backdrop ? null : sky.spot.value },
        get start() { return sky.start.value },
        traced  : sky.traces,
        get tracks() { return props.backdrop && !props.live ? EMPTY : sky.tracks }
      })
      overlay.scheme  = scheme.value
      overlay.covered = () => places.coveredOver(frame.value!)
      fit()

      map.on('error', ({ error, sourceId }: maplibregl.ErrorEvent & { sourceId?: string }) => {
        if (!(error instanceof maplibregl.GPUInitializationError)) return hosts.fail(sourceId)
        blanked()
      })
      map.on('sourcedata', ({ sourceId, tile }) => tile && hosts.load(sourceId))
      map.on('move', placed)
      map.on('move', aimed)
      map.on('movestart', () => { lifted.value = sky.choosing.value === 'open' })
      map.on('movestart', settle.stop)
      map.on('moveend', refreshFrame)
      map.on('moveend', rested)
      map.on('moveend', settle.start)
      map.on('idle', refreshFrame)
      map.on('idle', settle.start)
      map.on('resize', fit)
      if (!props.backdrop) followPointer()

      frames.resume()
      stepped()
      document.fonts.ready.then(() => overlay.invalidate())
    })

    /**
     * Answers the pointer over the map: the cursor it shows over a satellite or
     * the open map, and a press pinning the satellite under it or letting the
     * pinned one go.
     */
    const followPointer = () => {
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
    }

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
      if (choosing === 'open') return aimAt(sky.aim.value!.spot)
      const { latitude, longitude } = sky.spot.value
      if (choosing === 'landing') return map.easeTo({ center: [longitude, latitude], duration: FLY_MS })
      pin.value = null
      if (was === 'open') home()
    })
    watch(sky.gather, regather)
    watch(sky.covered, () => overlay?.invalidate())
    /**
     * Observes each panel beside the map. The zoom buttons are passed over,
     * since the sheet's resize reshapes them inside its own delivery, which the
     * browser reports as a `ResizeObserver` loop error, and the sheet and the
     * map each place the names again as they resize.
     */
    watch([frame, phone], ([map]) => {
      panels.value = map ? places.panelsOver(map).filter(panel => !map.parentElement!.contains(panel)) : []
    }, { flush: 'post' })
    useResizeObserver(panels, () => overlay?.invalidate())
    /**
     * Whether `bounds` stand wholly inside the map short of `padding`.
     */
    const shows = (bounds: maplibregl.LngLatBounds, padding: Required<maplibregl.PaddingOptions>) => {
      const { clientHeight: height, clientWidth: width } = map.getContainer()
      return [bounds.getNorthWest(), bounds.getSouthEast()]
        .map(corner => map.project(corner))
        .every(({ x, y }) => x >= padding.left && x <= width - padding.right
          && y >= padding.top && y <= height - padding.bottom)
    }

    /**
     * Frames a pinned pass's whole crossing, above a phone's sheet, and wider
     * than a phone clear of the panels over the map wherever any of it lies
     * outside them, and eases back to the spot once the pass is let go.
     */
    watch([sky.pinned, sky.covered], ([pass, covered], [was]) => {
      if (!map || phone.value && !covered) return
      const edge    = clamp((map.getContainer().clientHeight - covered) / 4, 0, PADDING)
      const padding = covered
        ? { bottom: covered + edge, left: PADDING, right: PADDING, top: edge }
        : places.paddingOver(frame.value!, PADDING)
      const whole   = pass && boundsOf(pass).whole
      if (!whole) return was && home()
      if (covered || !shows(whole, padding)) map.fitBounds(whole, { maxZoom: map.getZoom(), padding })
    })

    onBeforeUnmount(() => {
      map?.remove()
      sky.choosing.value = 'shut'
    })

    return () => (
      <div class="absolute inset-0 overflow-hidden bg-page" style={{ cursor: cursor.value }} data-map>
        <div ref={frame} class="size-full [&_.maplibregl-canvas]:cursor-[inherit]!" />
        {pin.value && (
          <div
            class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full text-ink"
            style={{ left: `${pin.value.x}px`, top: `${pin.value.y}px` }}
            aria-hidden="true"
          >
            <span
              class={[
                `absolute -bottom-1 left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-full bg-ink/30
                 transition-opacity motion-reduce:hidden`,
                lifted.value ? 'opacity-100' : 'opacity-0'
              ]}
            />
            <Icon
              key={String(lifted.value)}
              name="drop"
              size={32}
              class={[
                `block transition-transform duration-140 [filter:drop-shadow(0_0_1.5px_var(--page))]
                 motion-reduce:transition-none`,
                lifted.value ? 'motion-safe:-translate-y-2.5' : 'motion-safe:animate-land'
              ]}
            />
          </div>
        )}
        {!props.backdrop && (
          <div
            style={{ bottom: `${sky.covered.value}px` }}
            class="pointer-events-none absolute top-0 right-inset z-10 flex w-24 items-center justify-end
                   @container-size"
          >
            <div
              class="pointer-events-auto flex flex-col divide-y divide-rule overflow-hidden rounded-sm
                     border border-rule bg-panel/95 text-ink shadow-lift [&>button]:grid
                     [&>button]:size-11 [&>button]:cursor-pointer [&>button]:place-items-center
                     [&>button:hover]:bg-lift [@container(height<6rem)]:flex-row
                     [@container(height<6rem)]:divide-x [@container(height<6rem)]:divide-y-0"
              role="group"
              aria-label="Zoom"
              data-label-clear
            >
              <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}>
                <Icon name="zin" />
              </button>
              <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
                <Icon name="zout" />
              </button>
            </div>
          </div>
        )}
        {hosts.message.value && <div class="pointer-events-none absolute inset-0 bg-panel/62" />}
        <canvas ref={lower} class="pointer-events-none absolute inset-0 size-full" />
        <canvas ref={upper} class="pointer-events-none absolute inset-0 size-full" />
        {sky.stage.value === 'unloaded' && (
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 bg-panel/70 backdrop-grayscale"
          />
        )}
        {hosts.message.value && (
          <div
            class="pointer-events-none absolute inset-0 grid items-end justify-items-center p-6 pb-[8%]
                   xl:pl-[calc(var(--spacing-readout)+--spacing(8))]"
          >
            <p
              class="caps max-w-[24ch] border-y-[1.5px] border-ink bg-panel/88 px-3 py-2.5 text-center
                     text-sm! text-ink"
              role="alert"
            >
              {hosts.message.value}
            </p>
          </div>
        )}
      </div>
    )
  },
  { name: 'SkyMap', props: ['backdrop', 'live'] }
)
