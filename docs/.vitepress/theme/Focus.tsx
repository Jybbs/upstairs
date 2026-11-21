import { computed, defineComponent } from 'vue'

import { BOUNDS, boundOf, crossingOf } from '../lib/orbit/compass.ts'
import { KINDS, NOTES }                from '../lib/orbit/kinds.ts'
import { sky }                         from '../lib/state/sky.ts'
import { NAMES }                       from '../lib/state/words.ts'
import Icon                            from './Icon.tsx'
import SatelliteName                   from './SatelliteName.tsx'
import StepMark                        from './StepMark.tsx'

const distance = (kilometers: number) => `${Math.round(kilometers).toLocaleString()} km`

/**
 * Reads the failure that stopped the map and the way back from it, else the
 * pass the map follows, else the step the map waits on, or why no pass is
 * followed once the scan finishes.
 */
export default defineComponent(
  () => {
    const pass  = sky.focus
    const about = computed(() => {
      if (!pass.value) return ''
      const docked = sky.tracks.attached.get(pass.value) ?? 0
      const note   = NOTES[pass.value.id] ?? KINDS[pass.value.kind].about
      return docked
        ? `${note} Flying with ${docked} docked ${docked === 1 ? 'craft or module' : 'craft and modules'}.`
        : note
    })
    const bound = computed(() => pass.value && boundOf(pass.value))

    /**
     * Reads the step the moment leads with, by its mark, its name, and its
     * reading.
     */
    const kicker = () => {
      const { lead, ...moment } = sky.moment.value
      return (
        <p class={['caps flex items-center gap-2', moment.failure ? 'text-ink' : 'text-soft']}>
          <StepMark step={moment[lead]} size={10} />
          <span class="text-ink">{NAMES[lead]}</span>{' · '}{moment[lead].reading}
        </p>
      )
    }

    /**
     * Reads the failure between two ink rules, what stopped over the way back.
     */
    const failed = () => (
      <div class="flex flex-col gap-2 border-y-[1.5px] border-ink py-3">
        {kicker()}
        <p class="font-display text-[22px] leading-tight font-bold text-balance text-ink">
          {sky.moment.value.note}
        </p>
        <p class="text-[17px] leading-snug text-pretty text-ink">{sky.moment.value.next}</p>
      </div>
    )

    /**
     * Reads the step under way, its line over its note.
     */
    const waiting = () => [
      kicker(),
      <p class="mt-2 font-display text-[22px] leading-tight font-bold text-balance text-ink">
        {sky.moment.value.line}
      </p>,
      <p class="mt-2 text-[17px] leading-snug text-pretty text-ink">{sky.moment.value.note}.</p>
    ]

    /**
     * Reads why no pass is followed once the scan finishes.
     */
    const idle = () => (
      <p class="caps text-soft">
        {sky.stage.value === 'expired'
          ? 'The orbits are too old to draw'
          : 'No satellite matches these filters'}
      </p>
    )

    return () => (
      <section
        class={[
          'flex shrink-0 flex-col border-b border-rule bg-lift p-4',
          !pass.value && 'min-h-[150px]'
        ]}
        aria-live="polite"
      >
        {sky.moment.value.failure ? failed() : pass.value
          ? [
            <h2
              class="flex items-baseline justify-between font-display text-lg leading-tight font-bold
                     text-ink"
            >
              Watching{' '}
              <span class="caps font-normal text-soft">No. {pass.value.id}</span>
            </h2>,
            <p class="mt-2 flex min-w-0 items-center gap-2">
              <Icon name={pass.value.kind} />
              <span class="sr-only">{KINDS[pass.value.kind].label}: </span>
              <SatelliteName name={pass.value.name} class="truncate text-[22px] leading-tight" />
            </p>,
            <p class="mt-1 truncate text-sm leading-5" title={about.value}>{about.value}</p>,
            <dl class="caps mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-ink">
              <div>
                <dt class="sr-only">Highest</dt>
                <dd>{Math.round(pass.value.peak)}° at {sky.clockOf(pass.value.peakAt)}</dd>
              </div>
              <div>
                <dt class="sr-only">Crosses</dt>
                <dd class="inline-flex items-center gap-1">
                  {bound.value && [
                    <Icon name={BOUNDS[bound.value].mark} />,
                    <span class="sr-only">{BOUNDS[bound.value].label}, </span>
                  ]}
                  {crossingOf(pass.value)}
                </dd>
              </div>
              <div>
                <dt class="sr-only">Altitude</dt>
                <dd>{distance(pass.value.height)} up</dd>
              </div>
            </dl>
          ]
          : sky.waiting.value ? waiting() : idle()}
      </section>
    )
  },
  { name: 'Focus' }
)
