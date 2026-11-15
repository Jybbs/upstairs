import { computed, defineComponent } from 'vue'

import { BOUNDS, boundOf, crossingOf } from '../lib/orbit/compass.ts'
import { KINDS, NOTES }                from '../lib/orbit/kinds.ts'
import { sky }                         from '../lib/state/sky.ts'
import Icon                            from './Icon.tsx'
import SatelliteName                   from './SatelliteName.tsx'

const distance = (kilometers: number) => `${Math.round(kilometers).toLocaleString()} km`

/**
 * Reads the pass the map follows, or why no pass is followed.
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
    const empty = computed(() => {
      if (sky.expired.value) return 'The orbits are too old to draw'
      return sky.done.value ? 'No satellite matches these filters' : 'Tracing passes'
    })

    return () => (
      <section class="flex h-[218px] shrink-0 flex-col border-b border-rule bg-lift p-4" aria-live="polite">
        {pass.value
          ? [
            <p class="caps flex justify-between text-soft">
              <span class="inline-flex items-center gap-1.5">
                <Icon name={pass.value.kind} />{KINDS[pass.value.kind].label}
              </span>
              <span>No. {pass.value.id}</span>
            </p>,
            <h2 class="mt-1.5 truncate">
              <SatelliteName name={pass.value.name} class="text-[22px] leading-tight" />
            </h2>,
            bound.value && (
              <p class="caps inline-flex items-center gap-1 text-soft">
                <Icon name={BOUNDS[bound.value].mark} />{BOUNDS[bound.value].label}
              </p>
            ),
            <p class="mt-1.5 line-clamp-2 h-10 text-sm leading-5">{about.value}</p>,
            <dl class="mt-auto grid grid-cols-3 gap-2 border-t border-rule pt-2">
              <div>
                <dt class="caps text-soft">Highest</dt>
                <dd class="caps text-ink">
                  {Math.round(pass.value.peak)}° at {sky.clockOf(pass.value.peakAt)}
                </dd>
              </div>
              <div>
                <dt class="caps text-soft">Crosses</dt>
                <dd class="caps text-ink">{crossingOf(pass.value)}</dd>
              </div>
              <div>
                <dt class="caps text-soft">Altitude</dt>
                <dd class="caps text-ink">{distance(pass.value.height)}</dd>
              </div>
            </dl>
          ]
          : <p class="caps text-soft">{empty.value}</p>}
      </section>
    )
  },
  { name: 'Focus' }
)
