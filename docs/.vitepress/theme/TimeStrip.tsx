import { useElementSize, useEventListener, useRafFn } from '@vueuse/core'
import * as slider                                     from '@zag-js/slider'
import { mergeProps, normalizeProps, useMachine }      from '@zag-js/vue'
import { computed, defineComponent, ref, useId }       from 'vue'

import { boundOf }                  from '../lib/orbit/compass.ts'
import type { Pass }                from '../lib/orbit/scan.ts'
import { columnsOf, pickAt }        from '../lib/site/columns.ts'
import { turnOf }                   from '../lib/site/drag.ts'
import type { IconName }            from '../lib/site/icons.ts'
import { kindColor }                from '../lib/site/palette.ts'
import { usePhone }                 from '../lib/site/phone.ts'
import { ridgeOf }                  from '../lib/site/ridges.ts'
import { CLOCK }                    from '../lib/state/clock.ts'
import { minuteFormat, sky }        from '../lib/state/sky.ts'
import Credit                       from './Credit.tsx'
import Icon                         from './Icon.tsx'
import Ridge                        from './Ridge.tsx'
import RidgeTip                     from './RidgeTip.tsx'

/**
 * A label's width per character in ems, JetBrains Mono's advance of 0.6 beside
 * the 0.1 the `caps` letter spacing adds, the room in pixels kept between two
 * labels, and the font size in rems `caps` sets a label in on a phone and
 * wider.
 */
const LABEL = { advance: 0.7, gap: 8, phone: 0.75, wide: 0.6875 } as const
/**
 * The strip's height, the row its ground runs along, the height a pass
 * standing straight overhead climbs to above it, and its least inset either
 * side, in pixels.
 */
const STRIP = { ground: 74, height: 110, inset: 16, overhead: 60 } as const
const TICKS = 6
/**
 * How many ticks a label may stand apart, each dividing `TICKS` so the last
 * tick is labeled with the first.
 */
const EVERY = [1, 2, 3, 6] as const
/**
 * The seconds each key moves the time by, a minute to an arrow and ten to a
 * Page key.
 */
const nudges = new Map([['ArrowLeft', -60], ['ArrowRight', 60], ['PageDown', -600], ['PageUp', 600]])

/**
 * Draws the hour as a ridgeline on a slider over the window's seconds,
 * beside the round button that runs the clock or returns it to the present.
 */
export default defineComponent(
  () => {
    const cursor    = ref<SVGGElement>()
    const root      = ref<HTMLElement>()
    const strip     = ref<SVGSVGElement>()
    const phone     = usePhone()
    const { width } = useElementSize(strip, { height: 0, width: 800 })
    /**
     * What the round button does next: run the fast-forward from the present,
     * return to the present, or under reduced motion move the held frame on.
     */
    const turning = computed((): { label: string, mark: IconName | 'step' } => {
      if (sky.reduced) {
        return { label: `Draw the sky ${minuteFormat.format(CLOCK.ahead / 60)} on`, mark: 'step' }
      }
      return sky.clock.value === 'live'
        ? { label: `Run the rest of the hour at ${CLOCK.lapse} times real speed`, mark: 'lapse' }
        : { label: 'Back to now', mark: 'now' }
    })
    /**
     * The page's root font size in pixels, which scales the rems `caps` sets a
     * label in.
     */
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    const clocks = computed(() =>
      Array.from({ length: TICKS + 1 }, (_, index) => sky.clockOf(index * sky.span / TICKS)))
    /**
     * The width in pixels of the widest tick label.
     */
    const label = computed(() => Math.max(...clocks.value.map(clock => clock.length)) * LABEL.advance
      * (phone.value ? LABEL.phone : LABEL.wide) * rem)
    /**
     * The inset either side, wide enough that the labels at either end center
     * on their ticks inside the strip.
     */
    const inset = computed(() => Math.max(STRIP.inset, Math.ceil(label.value / 2)))
    const inner = computed(() => width.value - inset.value * 2)
    /**
     * The climb of each pass that rises or sets in the window, in the order the
     * passes peak.
     */
    const climbs = computed(() => sky.rows.value.list
      .filter(pass => boundOf(pass) !== 'holding' && !(pass.earlier && pass.later))
      .map(pass => ({ climb: sky.climbOf(pass), pass })))
    /**
     * Each climb drawn as a ridge across the strip's width, with its outline,
     * its crest seen and unseen, and its peak.
     */
    const ridges = computed(() => climbs.value.map(({ climb, pass }) => ({
      pass  : pass,
      ridge : ridgeOf(climb, pass, xOf, yOf)
    })))
    /**
     * The ridges from the highest to the lowest, so a lower ridge stands in
     * front of a higher one, with the ridge a pointer, a finger, or a key holds
     * raised above them all and the ridges the readout and the map show drawn
     * heavier.
     */
    const stacked = computed(() => ridges.value
      .map(ridge => ({ ...ridge, heavy: ridge.pass === sky.shown.value || ridge.pass === sky.focus.value }))
      .toSorted((a, b) =>
        Number(a.pass === sky.held.value) - Number(b.pass === sky.held.value) || b.pass.peak - a.pass.peak))
    const ridgeFor = (wanted: Pass | null) => ridges.value.find(({ pass }) => pass === wanted) ?? null
    /**
     * The ridge the map follows, whether its row or its ridge chose it.
     */
    const chosen = computed(() => ridgeFor(sky.focus.value))
    /**
     * The ridge a pointer, a finger, or a key raises, which the tip names.
     */
    const raised = computed(() => ridgeFor(sky.held.value))
    /**
     * The strip's ticks, each label centered on its own, labeled every so many
     * ticks that each label clears the next by `LABEL.gap`.
     */
    const ticks = computed(() => {
      const every = EVERY.find(each => each * inner.value / TICKS >= label.value + LABEL.gap) ?? TICKS
      return clocks.value.map((clock, index) => {
        const seconds = index * sky.span / TICKS
        return { clock: index % every === 0 ? clock : '', seconds: seconds, x: xOf(seconds) }
      })
    })
    /**
     * The strip cut into columns around the peaks, which a tap on a phone picks
     * from.
     */
    const columns = computed(() =>
      columnsOf(ridges.value.map(({ pass, ridge }) => ({ item: pass, x: ridge.peak[0] })), width.value))

    /**
     * Where a press on a phone's strip went down, and whether it has turned
     * into a drag across the strip or up and down it.
     */
    let down: { drag: 'across' | 'along' | null, x: number, y: number } | null = null

    /**
     * Raises the ridge `by` places later or earlier than the one raised, or
     * where none is raised the first to peak after the time read or the last
     * before it.
     */
    const browse = (by: 1 | -1) => {
      const passes = ridges.value.map(({ pass }) => pass)
      const index  = passes.findIndex(pass => pass === sky.held.value)
      const at     = sky.at.value
      const next   = index >= 0 ? passes[index + by]
        : by > 0 ? passes.find(pass => pass.peakAt >= at) : passes.findLast(pass => pass.peakAt < at)
      if (next) sky.held.value = next
    }

    const drag = (event: PointerEvent) => {
      if (!strip.value!.hasPointerCapture(event.pointerId)) return
      if (down && !down.drag) {
        down.drag = turnOf(down.x, down.y, event)
        if (!down.drag) return
        sky.held.value = null
      }
      if (down?.drag !== 'along') sky.seek(secondsAt(event.clientX))
    }

    /**
     * Lets the raised ridge fall back once the pointer, the finger, or the
     * focus leaves the strip.
     */
    const leave = () => {
      down           = null
      sky.held.value = null
    }

    /**
     * Chooses on a phone the pass a tap lands on, from the column under it.
     */
    const lift = (event: PointerEvent) => {
      if (down && !down.drag) {
        const picked = pickAt(columns.value, xAt(event.clientX), sky.pinned.value)
        if (picked) sky.focusOn(picked)
      }
      leave()
    }

    /**
     * Browses the ridges on the up and down arrows, chooses the raised one on
     * Enter, and moves the time a minute on the left and right arrows and ten
     * on a Page key, leaving Home and End to the slider.
     */
    const nudge = (event: KeyboardEvent) => {
      const held = sky.held.value
      const step = nudges.get(event.key)
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') browse(event.key === 'ArrowUp' ? 1 : -1)
      else if (event.key === 'Enter' && held) sky.focusOn(held)
      else if (step) sky.seek(sky.seconds + step)
      else return
      event.preventDefault()
    }

    /**
     * Starts a press on the strip, which on a phone raises the ridge a tap
     * there would choose while the finger holds still.
     */
    const press = (event: PointerEvent) => {
      strip.value!.setPointerCapture(event.pointerId)
      if (!phone.value) return sky.seek(secondsAt(event.clientX))
      down           = { drag: null, x: event.clientX, y: event.clientY }
      sky.held.value = pickAt(columns.value, xAt(event.clientX), sky.pinned.value)
    }

    /**
     * Chooses the pass whose ridge a pointer presses wider than a phone and
     * moves the clock to its peak, leaving a phone's press to the column under
     * it.
     */
    const pressRidge = (event: PointerEvent, pass: Pass) => {
      if (phone.value) return
      event.stopPropagation()
      sky.focusOn(pass)
    }

    /**
     * Closes the map's credit on a press of the strip it fades, leaving a
     * press of the credit itself to the credit.
     */
    const shade = (event: PointerEvent) => {
      const { target } = event
      if (!(target instanceof Element && target.closest('.credit-panel, .credit-ring'))) sky.credit.close()
    }

    useEventListener(root, 'pointerdown', shade, { capture: true })

    const secondsAt = (clientX: number) => (xAt(clientX) - inset.value) / inner.value * sky.span

    /**
     * Measures how far in pixels a pointer at `clientX` stands from the strip's
     * left edge.
     */
    const xAt = (clientX: number) => clientX - strip.value!.getBoundingClientRect().left

    const xOf = (seconds: number) => inset.value + seconds / sky.span * inner.value

    const yOf = (elevation: number) => STRIP.ground - elevation / 90 * STRIP.overhead

    /**
     * Runs the strip as a slider over the window's seconds.
     */
    const id      = useId()
    const service = useMachine(slider.machine, computed(() => ({
      id             : id,
      max            : sky.span,
      min            : 0,
      onValueChange  : ({ value }: slider.ValueChangeDetails) => sky.seek(value[0]),
      thumbAlignment : 'center' as const,
      value          : [sky.at.value]
    })))
    const api = computed(() => slider.connect(service, normalizeProps))

    useRafFn(() => cursor.value?.setAttribute('transform', `translate(${xOf(sky.seconds)} 0)`))

    return () => {
      const {
        'aria-labelledby' : _labelledby,
        onPointerdown     : _down,
        style             : _style,
        ...thumb
      } = api.value.getThumbProps({ index: 0 })
      const mark = turning.value.mark

      return (
        <section ref={root} class="shrink-0 border-t border-rule bg-panel" aria-label="Time">
          <div class="flex items-center gap-2 px-4">
            <button
              type="button"
              class="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-rule
                     bg-lift text-ink hover:border-soft"
              aria-label={turning.value.label}
              onClick={() => sky.turn()}
            >
              {mark === 'step'
                ? (
                  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                    <path d="M1.5 1.5v9L7.5 6zM8.75 1.5h2v9h-2z" fill="currentColor" />
                  </svg>
                )
                : <Icon name={mark} />}
            </button>
            <div class="relative min-w-0 flex-1">
              <svg
                {...mergeProps(thumb, { onKeydown: nudge })}
                ref={strip}
                class={[
                  `block w-full cursor-ew-resize touch-none select-none transition-[filter]
                   duration-1050 ease-[cubic-bezier(.55,0,.25,1)] motion-reduce:transition-none`,
                  sky.credit.open.value && 'grayscale'
                ]}
                height={STRIP.height}
                aria-label="Time within the window"
                aria-keyshortcuts="ArrowUp ArrowDown Enter"
                aria-valuenow={Math.round(sky.at.value)}
                aria-valuetext={`${sky.clockOf(sky.at.value)}, ${sky.dayOf(sky.at.value)}`}
                onBlur={leave}
                onPointercancel={leave}
                onPointerdown={press}
                onPointermove={drag}
                onPointerup={lift}
              >
                {stacked.value.map(({ heavy, pass, ridge }) => (
                  <g
                    key={pass.key}
                    class="cursor-pointer"
                    onPointerdown={(event: PointerEvent) => pressRidge(event, pass)}
                    onPointerenter={() => phone.value || (sky.held.value = pass)}
                    onPointerleave={() => phone.value || (sky.held.value = null)}
                  >
                    <Ridge
                      dash="1 3"
                      kind={pass.kind}
                      ridge={ridge}
                      shade={heavy ? 30 : 14}
                      weight={heavy ? 2.5 : 1.5}
                    />
                  </g>
                ))}
                {chosen.value && (
                  <g class="pointer-events-none" data-chosen>
                    <path
                      d={chosen.value.ridge.outline}
                      fill={kindColor(chosen.value.pass.kind)}
                      fill-opacity="0.35"
                    />
                    <line
                      x1={chosen.value.ridge.ends[0]}
                      x2={chosen.value.ridge.ends[1]}
                      y1={STRIP.ground}
                      y2={STRIP.ground}
                      stroke={kindColor(chosen.value.pass.kind)}
                      stroke-width="5"
                    />
                    <g
                      fill="none"
                      stroke={kindColor(chosen.value.pass.kind)}
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="3"
                    >
                      <path d={chosen.value.ridge.seen} />
                      <path d={chosen.value.ridge.unseen} stroke-dasharray="1 4" />
                    </g>
                    <circle
                      cx={chosen.value.ridge.peak[0]}
                      cy={chosen.value.ridge.peak[1]}
                      r="4"
                      stroke-width="2"
                      class="fill-ink stroke-panel"
                    />
                  </g>
                )}
                <line
                  x1={inset.value}
                  x2={width.value - inset.value}
                  y1={STRIP.ground}
                  y2={STRIP.ground}
                  class="pointer-events-none stroke-dim"
                />
                {ticks.value.map(tick => (
                  <g key={tick.seconds} class="pointer-events-none">
                    <line
                      x1={tick.x}
                      x2={tick.x}
                      y1={STRIP.ground - 3}
                      y2={STRIP.ground + 3}
                      class="stroke-dim"
                    />
                    <text x={tick.x} y={STRIP.height - 5} text-anchor="middle" class="caps fill-soft">
                      {tick.clock}
                    </text>
                  </g>
                ))}
                <g class="pointer-events-none" transform={`translate(${xOf(sky.now.value)} 0)`}>
                  <line y1={STRIP.ground + 3} y2={STRIP.ground + 12} class="stroke-ink" stroke-width="1.5" />
                  <text y={STRIP.height - 20} text-anchor="middle" class="caps fill-ink">Now</text>
                </g>
                <g ref={cursor} class="pointer-events-none">
                  <line y1={4} y2={STRIP.ground + 3} class="stroke-u" stroke-width="1.5" />
                  <path d="M-5 2 L5 2 L0 9 Z" class="fill-u" />
                </g>
              </svg>
              <RidgeTip
                pass={raised.value?.pass ?? null}
                width={width.value}
                x={raised.value?.ridge.peak[0] ?? 0}
              />
            </div>
            {!phone.value && <Credit />}
          </div>
        </section>
      )
    }
  },
  { name: 'TimeStrip' }
)
