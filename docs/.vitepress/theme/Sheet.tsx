import { useElementSize }             from '@vueuse/core'
import * as drawer                    from '@zag-js/drawer'
import { normalizeProps, useMachine } from '@zag-js/vue'
import { computed, defineComponent, onBeforeUnmount, ref, useId, watch } from 'vue'

import { turnOf }    from '../lib/site/drag.ts'
import { clamp }     from '../lib/site/motion.ts'
import { ridgeOf }   from '../lib/site/ridges.ts'
import { sky }       from '../lib/state/sky.ts'
import Filters       from './Filters.tsx'
import KindTag       from './KindTag.tsx'
import PassList      from './PassList.tsx'
import PassReadout   from './PassReadout.tsx'
import Readout       from './Readout.tsx'
import Ridge         from './Ridge.tsx'
import SatelliteName from './SatelliteName.tsx'
import Stamp         from './Stamp.tsx'
import TimeStrip     from './TimeStrip.tsx'

/**
 * The height of the pinned pass's climb in pixels, and how far its line stands
 * in from each edge.
 */
const CLIMB = { height: 104, inset: 4 } as const
/**
 * How many milliseconds of a throw's speed carry the sheet's aim on past
 * where the drag lets go, the sheet landing on the stop nearest it.
 */
const THROW = 180
/**
 * The sheet's stops, peek holding the count, the time, and the strip, half
 * setting the strip aside for the pinned pass, and full bringing the strip
 * back above the pass, the hour's list, and the shield.
 */
const STOPS = ['peek', 'half', 'full'] as const

/**
 * Holds a phone's readout in a sheet over the map, resting at the count and the
 * strip, at the pinned pass, or at the hour's list.
 */
export default defineComponent(
  () => {
    /**
     * Runs the sheet as a non-modal drawer held open, its snap point the stop
     * it rests at.
     */
    const id      = useId()
    const service = useMachine(drawer.machine, computed(() => ({
      closeOnEscape          : false,
      closeOnInteractOutside : false,
      defaultSnapPoint       : STOPS[0],
      id                     : id,
      initialFocusEl         : () => false as const,
      modal                  : false,
      open                   : true,
      preventDragOnScroll    : false,
      restoreFocus           : false,
      snapPoints             : [...STOPS]
    })))
    const api = computed(() => drawer.connect(service, normalizeProps))
    /**
     * The index of the stop the sheet rests at.
     */
    const stop = computed(() => api.value.getSnapPointIndex() as 0 | 1 | 2)

    const block  = ref<HTMLElement>()
    const climb  = ref<SVGSVGElement>()
    const head   = ref<HTMLElement>()
    const peek   = ref<HTMLElement>()
    const sheet  = ref<HTMLElement>()
    const shown  = ref(0)
    const moving = ref(false)

    const { height: peekHeight }  = useElementSize(peek, undefined, { box: 'border-box' })
    const { height: headHeight }  = useElementSize(head, undefined, { box: 'border-box' })
    const { height: blockHeight } = useElementSize(block, undefined, { box: 'border-box' })
    const { height: sheetHeight } = useElementSize(sheet, undefined, { box: 'border-box' })
    const { width: climbWidth }   = useElementSize(climb)
    /**
     * The peek's height as last measured with the strip in it, since the half
     * stop sets the strip aside.
     */
    const rested = ref(0)
    /**
     * The height the sheet shows at each stop, half standing no higher than
     * full.
     */
    const stops = computed(() => [
      rested.value,
      sky.shown.value
        ? Math.min(Math.ceil(headHeight.value + blockHeight.value), sheetHeight.value)
        : rested.value,
      sheetHeight.value
    ])
    /**
     * The pinned pass's climb from its rise to its set as a ridge, filling the
     * width its line takes and rising to its peak at the top, beside the times
     * it rises, peaks, and sets.
     */
    const pinned = computed(() => {
      const pass = sky.shown.value
      if (!pass) return null
      const steps        = sky.climbOf(pass)
      const [from, to]   = [steps[0].at, steps.at(-1)!.at]
      const [across, up] = [climbWidth.value - CLIMB.inset * 2, CLIMB.height - CLIMB.inset * 2]
      const x            = (at: number) => CLIMB.inset + (at - from) / (to - from || 1) * across
      const y            = (elevation: number) => CLIMB.height - elevation / pass.peak * up
      return {
        pass  : pass,
        ridge : ridgeOf(steps, pass, x, y),
        times : [
          sky.clockOf(from), `${Math.round(pass.peak)}° ${sky.clockOf(pass.peakAt)}`, sky.clockOf(to)
        ]
      }
    })

    /**
     * Where a drag of the sheet went down, the height shown then, and its speed
     * in pixels per millisecond, positive downward.
     */
    let grabbed: { at: number, from: number, last: number, speed: number, y: number } | null = null
    let pressed: { pointer: number, x: number, y: number } | null = null
    let dragged = false

    /**
     * Steps the sheet to its next stop up, or back down from full to half while
     * a pass is shown and to peek otherwise.
     */
    const cycle = () => rest(stop.value === 2 ? 1 : stop.value === 0 && sky.shown.value ? 1 : 2)

    /**
     * Moves the sheet with a drag up or down, once the press has turned up or
     * down rather than across.
     */
    const move = (event: PointerEvent) => {
      if (pressed && !grabbed) {
        const turn = turnOf(pressed.x, pressed.y, event)
        if (!turn) return
        if (turn === 'across') {
          pressed = null
          return
        }
        ;(event.currentTarget as Element).setPointerCapture(pressed.pointer)
        grabbed = {
          at    : performance.now(),
          from  : shown.value,
          last  : event.clientY,
          speed : 0,
          y     : pressed.y
        }
        dragged      = true
        moving.value = true
      }
      if (!grabbed) return
      const now     = performance.now()
      grabbed.speed = grabbed.speed / 2 + (event.clientY - grabbed.last) / Math.max(now - grabbed.at, 1) / 2
      grabbed.at    = now
      grabbed.last  = event.clientY
      shown.value   = clamp(grabbed.from - (event.clientY - grabbed.y), stops.value[0], stops.value[2])
    }

    const press = (event: PointerEvent) => {
      dragged = false
      if ((event.target as Element).closest('input, a, .overflow-y-auto')) return
      pressed = { pointer: event.pointerId, x: event.clientX, y: event.clientY }
    }

    /**
     * Lands a drag on the stop nearest where it is thrown toward.
     */
    const release = () => {
      pressed = null
      if (!grabbed) return
      const aim  = shown.value - grabbed.speed * THROW
      const away = (at: 0 | 1 | 2) => Math.abs(stops.value[at] - aim)
      const near = ([0, 1, 2] as const).reduce((best, at) => away(at) < away(best) ? at : best)
      grabbed      = null
      moving.value = false
      shown.value  = stops.value[near]
      rest(near)
    }

    /**
     * Rests the sheet at stop `to`, at peek once no pass is pinned in place of
     * half, letting the pinned pass go at peek.
     */
    const rest = (to: 0 | 1 | 2) => {
      const at = to === 1 && !sky.shown.value ? 0 : to
      api.value.setSnapPoint(STOPS[at])
      if (at === 0) sky.release()
    }

    watch(peekHeight, height => { if (stop.value !== 1) rested.value = height }, { immediate: true })
    watch(sky.pinned, pinned => { if (pinned) rest(1); else if (stop.value === 1) rest(0) })
    watch([stop, stops], () => {
      if (grabbed) return
      shown.value       = stops.value[stop.value]
      sky.covered.value = stops.value[Math.min(stop.value, 1)]
    }, { immediate: true })
    onBeforeUnmount(() => { sky.covered.value = 0 })

    return () => {
      const held = pinned.value
      const pass = sky.shown.value
      const {
        'aria-describedby' : _describedby,
        'aria-labelledby'  : _labelledby,
        'aria-modal'       : _modal,
        onPointerdown      : _down,
        role               : _role,
        style              : _style,
        tabindex           : _tab,
        ...content
      } = api.value.getContentProps()

      return (
        <section
          {...content}
          ref={sheet}
          class={[
            'absolute inset-x-0 bottom-0 z-20 flex h-[calc(100%-8px)] flex-col rounded-t-2xl border-t',
            'border-rule bg-panel shadow-lift transition-transform duration-500',
            'ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none',
            { 'transition-none!': moving.value }
          ]}
          style={{ transform: `translateY(${sheetHeight.value - shown.value}px)` }}
          aria-label="The hour and the pinned pass"
          onPointercancel={release}
          onPointerdown={press}
          onPointermove={move}
          onPointerup={release}
        >
          <div ref={peek} class="shrink-0">
            <div ref={head}>
              <button
                type="button"
                class="relative block h-11 w-full cursor-grab touch-none"
                aria-label={
                  ['Raise the sheet', 'Raise the sheet to the hour’s list', 'Lower the sheet'][stop.value]
                }
                onClick={() => dragged || cycle()}
              >
                <span class="absolute top-2.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-soft" />
              </button>
              <Readout folded class="touch-none" />
            </div>
            <TimeStrip v-show={stop.value !== 1} />
          </div>
          <div ref={block} class="shrink-0 border-t border-rule" inert={stop.value < 1}>
            {held && (
              <div class="flex flex-col gap-3 px-4 pt-5 pb-3">
                <p class="flex items-center gap-2">
                  <KindTag kind={held.pass.kind} />
                  <SatelliteName name={held.pass.name} class="truncate text-base leading-tight text-ink" />
                </p>
                <svg
                  ref={climb}
                  class="block w-full overflow-visible"
                  height={CLIMB.height}
                  role="img"
                  aria-label={`The pass climbs to ${Math.round(held.pass.peak)}° from its rise to its set`}
                >
                  <Ridge dash="1 3.5" kind={held.pass.kind} ridge={held.ridge} shade={18} weight={2} />
                </svg>
                <p class="caps flex justify-between gap-2 text-soft">
                  {held.times.map(time => <span key={time}>{time}</span>)}
                </p>
                <p class="flex justify-between gap-2">
                  <button
                    type="button"
                    class="caps h-11 cursor-pointer px-2 text-ink"
                    onClick={() => sky.step(-1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    class="caps h-11 cursor-pointer px-2 text-ink"
                    onClick={() => sky.step(1)}
                  >
                    Next
                  </button>
                </p>
              </div>
            )}
          </div>
          <div
            class="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-rule"
            inert={stop.value < 2}
          >
            {pass && <PassReadout key={pass.key} pass={pass} class="border-b border-rule p-4" />}
            <Filters />
            <PassList />
            <Stamp />
          </div>
        </section>
      )
    }
  },
  { name: 'Sheet' }
)
