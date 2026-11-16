import { useEventListener }                      from '@vueuse/core'
import { computed, defineComponent, ref, watch } from 'vue'

import { coordinatesOf }                          from '../lib/orbit/compass.ts'
import { KINDS, kindSlots }                       from '../lib/orbit/kinds.ts'
import { useChooser }                             from '../lib/site/chooser.ts'
import { CLOCK, minuteFormat, secondFormat, sky } from '../lib/state/sky.ts'
import { WORDS }                                  from '../lib/state/words.ts'
import Icon                                       from './Icon.tsx'
import PassReadout                                from './PassReadout.tsx'
import PlaceSearch                                from './PlaceSearch.tsx'
import Tally                                      from './Tally.tsx'

const dateFormat    = new Intl.DateTimeFormat([], { day: 'numeric', month: 'long', weekday: 'long' })
const weekdayFormat = new Intl.DateTimeFormat([], { weekday: 'short' })

/**
 * Reads the spot, the time, and the count of satellites on the map, or the
 * pinned pass in the count's place, over the place search.
 *
 * `folded` folds the readout into the head of a phone's sheet, the count and
 * the time over the search, where the sheet shows the pinned pass below.
 */
export default defineComponent(
  (props: { folded?: boolean }) => {
    const chooser = useChooser()
    const later   = computed(() => sky.laterDay(sky.at.value))
    const dated   = computed(() => later.value
      ? `The time read is on ${sky.dayOf(sky.at.value, dateFormat)}.`
      : '')
    /**
     * The count of satellites on the map, a dash where the map cannot draw or
     * nothing can be placed, and dots until the scan places its first.
     */
    const figure = computed(() => {
      const stage = sky.stage.value
      if (sky.blank.value || stage === 'expired' || stage === 'unloaded') return '—'
      if (sky.placed.value) return sky.reading.value.onMap.toLocaleString()
      return stage === 'untraced' ? '—' : '···'
    })
    /**
     * The kind the tally names, in its color beside how many of it the map
     * draws of how many stand above the horizon.
     */
    const named = computed(() => {
      const kind = sky.named.value
      if (!kind) return null
      const index                 = kindSlots[kind]
      const { aboveKinds, kinds } = sky.reading.value
      return {
        kind : kind,
        line : `${KINDS[kind].label} · ${kinds[index].toLocaleString()} of `
             + `${aboveKinds[index].toLocaleString()} up`
      }
    })
    const over = computed(() => sky.place.value ?? coordinatesOf(sky.spot.value))
    /**
     * Whether the spot has moved since the page opened, its name then settling
     * in letter by letter.
     */
    const moved = ref(false)
    watch(over, () => { moved.value = true })
    /**
     * The tag beside the figure: how far a held frame stands from the present
     * under reduced motion, and otherwise what the clock is doing.
     */
    const tag = computed(() => {
      const away = sky.away.value
      if (sky.reduced) return away === 0 ? 'Now' : away < 0 ? `${-away} min ago` : `In ${away} min`
      return { held: 'Paused', live: 'Live', running: `${CLOCK.lapse}× speed` }[sky.clock.value]
    })
    const tagLabel = computed(() => {
      const away = sky.away.value
      if (!away) return 'The frame is the sky as it is now'
      const minutes = minuteFormat.format(Math.abs(away))
      return `Draw the sky as it is now, the frame is ${minutes} ${away < 0 ? 'behind' : 'ahead'}`
    })
    /**
     * The clock, after the weekday once the time read falls on a later day.
     */
    const when = computed(() => {
      const clock = sky.clockOf(sky.at.value, sky.clock.value === 'running' ? secondFormat : undefined)
      return later.value ? `${sky.dayOf(sky.at.value, weekdayFormat)} ${clock}` : clock
    })

    useEventListener(window, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && sky.choosing.value === 'shut') sky.release()
    }, { capture: true })

    const retry = () => (
      <button type="button" class="caps cursor-pointer text-ink underline" onClick={() => sky.load()}>
        {WORDS.retry}
      </button>
    )

    /**
     * Sets the line under the tally: the catalog's download or its trouble,
     * the scan's progress or its failure, the kind the tally names, or how
     * many stand above the horizon.
     */
    const status = () => {
      const stage = sky.stage.value
      if (stage === 'unloaded' || stage === 'partial') return [WORDS[stage], retry()]
      if (stage === 'expired') return `Orbits ${Math.floor(sky.age.value)} days old, too old to draw`
      if (stage === 'fetching' || stage === 'untraced') return WORDS[stage]
      if (stage === 'tracing') return `Tracing passes ${Math.round(sky.share.value * 100)}%`
      if (named.value) return [<Icon name={named.value.kind} />, named.value.line]
      return `Of ${sky.reading.value.above.toLocaleString()} above the horizon`
    }

    return () => (
      <section
        class={[
          'flex flex-col gap-3',
          props.folded ? 'px-4 pb-3' : 'rounded-sm border border-rule bg-panel/95 p-4 backdrop-blur-sm'
        ]}
      >
        <p class="caps truncate text-soft">
          {'Above '}
          <button
            {...chooser.value.getTriggerProps()}
            class="caps cursor-pointer text-ink underline decoration-rule underline-offset-4
                   hover:decoration-soft max-sm:py-3.25"
            aria-label={`Choose the spot, now ${over.value}`}
          >
            <Icon name="place" class="-mt-0.5 inline align-middle" />
            <span key={over.value}>
              {[...over.value].map((letter, index) => (
                <i
                  key={index}
                  class={[
                    'inline-block whitespace-pre not-italic',
                    moved.value && 'motion-safe:animate-settle'
                  ]}
                  style={{ '--i': index }}
                >{letter}</i>
              ))}
            </span>
          </button>
          {' · '}<span class="text-ink">{when.value}</span>
        </p>
        {!props.folded && sky.shown.value
          ? <PassReadout key={sky.shown.value.key} pass={sky.shown.value} />
          : [
            <div class="flex items-baseline gap-2.5">
              <output class="font-mono text-5xl leading-none font-medium tabular-nums" aria-live="off">
                {figure.value}
              </output>
              <span class="caps text-soft">On this map</span>
              {sky.reduced
                ? (
                  <button
                    type="button"
                    class="caps ml-auto cursor-pointer rounded-full border border-rule px-2.5 py-1
                           whitespace-nowrap text-ink hover:border-soft aria-disabled:cursor-default
                           aria-disabled:text-soft"
                    aria-disabled={sky.away.value === 0}
                    aria-label={tagLabel.value}
                    onClick={() => sky.away.value && sky.back()}
                  >{tag.value}</button>
                )
                : (
                  <span
                    class="caps ml-auto rounded-full border border-rule px-2.5 py-1 whitespace-nowrap
                           text-ink"
                  >
                    {tag.value}
                  </span>
                )}
            </div>,
            !props.folded && [
              <Tally />,
              <p class="caps flex h-3 items-center gap-2 text-soft">{status()}</p>
            ]
          ]}
        <p class="sr-only" aria-live="polite">{sky.spoken.value}</p>
        <p class="sr-only" aria-live="polite">{dated.value}</p>
        <PlaceSearch />
      </section>
    )
  },
  { name: 'Readout', props: ['folded'] }
)
