import { computed, defineComponent } from 'vue'

import { BOUNDS, boundOf, slantOf } from '../lib/orbit/compass.ts'
import type { Pass }                from '../lib/orbit/scan.ts'
import { kindColor }                from '../lib/site/palette.ts'
import { sky }                      from '../lib/state/sky.ts'
import Icon                         from './Icon.tsx'
import KindTag                      from './KindTag.tsx'
import PassSky                      from './PassSky.tsx'
import SatelliteName                from './SatelliteName.tsx'

/**
 * Reads the pinned pass: its name and kind, how far it stands, how high it
 * peaks and stands now, a rail from the spot to its farthest reach, and its
 * hours above the horizon over its drawing.
 */
export default defineComponent(
  (props: { pass: Pass }) => {
    const bound = computed(() => boundOf(props.pass))
    const ends  = computed(() =>
      [Math.max(props.pass.riseAt, 0), Math.min(props.pass.setAt, sky.span)] as const)
    const index = computed(() => sky.tracks.passes.indexOf(props.pass))

    /**
     * Reads the distance from the spot to the satellite at `seconds` into the
     * window, reading its elevation into `sky.tracks`, or null while it is
     * down.
     */
    const slantAt = (seconds: number) => sky.tracks.at(index.value, seconds) && sky.tracks.elevation >= 0
      ? slantOf(props.pass.height, sky.tracks.elevation)
      : null

    /**
     * The farthest the satellite stands from the spot while it is up in the
     * window, which the rail's far end marks.
     */
    const farthest = computed(() => Math.max(...ends.value.map(seconds => slantAt(seconds) ?? 0)))
    /**
     * When the pass stands above the horizon within the window.
     */
    const hours = computed(() => {
      const { earlier, later, riseAt, setAt } = props.pass
      if (earlier && later) return 'Up all hour'
      if (earlier) return `Up until ${sky.clockOf(setAt)}`
      if (later) return `Up from ${sky.clockOf(riseAt)}`
      return `Up ${sky.rangeOf(riseAt, setAt)}`
    })
    /**
     * Where the satellite stands at the time read, or null while it is down.
     */
    const now = computed(() => {
      const seconds = sky.at.value
      if (seconds < props.pass.riseAt || seconds > props.pass.setAt) return null
      const range = slantAt(seconds)
      return range === null ? null : { elevation: sky.tracks.elevation, range }
    })

    /**
     * Reads the share of the rail's length a distance from the spot stands at.
     */
    const railAt  = (range: number) => `${Math.min(range / (farthest.value || 1), 1) * 100}%`
    const nearest = computed(() => railAt(props.pass.range))

    return () => (
      <div class="flex flex-col gap-2">
        <SatelliteName
          name={props.pass.name}
          class="text-[22px] leading-tight tracking-tight text-balance text-ink"
        />
        <p class="flex items-center gap-2">
          <KindTag kind={props.pass.kind} />
          <span class="h-px flex-1 bg-rule" />
          <span class="caps inline-flex items-center gap-1 text-soft">
            <Icon name={BOUNDS[bound.value].mark} />{BOUNDS[bound.value].label}
          </span>
        </p>
        <dl
          class="grid grid-cols-[minmax(0,1fr)_auto_auto] [&>div]:flex [&>div]:flex-col-reverse
                 [&>div]:justify-end [&>div]:gap-1 [&>div+div]:border-l [&>div+div]:border-rule
                 [&>div+div]:pl-3
                 [&_dd]:font-mono [&_dd]:text-2xl [&_dd]:leading-none [&_dd]:font-medium [&_dd]:tabular-nums
                 [&_dt]:caps [&_dt]:text-soft"
        >
          <div class="pr-2.5">
            <dt>{now.value ? 'Km away' : 'Km nearest'}</dt>
            <dd>
              {(now.value ? Math.round(now.value.range / 10) * 10 : Math.round(props.pass.range))
                .toLocaleString()}
            </dd>
          </div>
          <div class="pr-3">
            <dt>Peaks</dt>
            <dd>{Math.round(props.pass.peak)}°</dd>
          </div>
          <div class="min-w-[4ch]">
            <dt>Now</dt>
            <dd>{now.value ? `${Math.round(now.value.elevation)}°` : 'Down'}</dd>
          </div>
        </dl>
        <div class="relative h-[34px]" aria-hidden="true">
          <span
            class="absolute top-[3px] left-0 size-2.5 rounded-full border-[1.5px] border-u
                   bg-[radial-gradient(circle,var(--u)_0_1.6px,transparent_2px)]"
          />
          <span class="absolute inset-x-0 top-[7.5px] h-px bg-rule" />
          <span class="absolute top-0 right-[5px] left-[18px] h-4">
            <span
              class="absolute top-[3.5px] -ml-[4.5px] size-[9px] rounded-full border-[1.5px] border-soft
                     bg-panel"
              style={{ left: nearest.value }}
            />
            {now.value && (
              <span
                class="absolute top-[3px] -ml-[5px] size-2.5 rounded-full"
                style={{ background: kindColor(props.pass.kind), left: railAt(now.value.range) }}
              />
            )}
            <span class="caps absolute top-4 -translate-x-1/2 text-soft" style={{ left: nearest.value }}>
              Nearest
            </span>
          </span>
          <span class="caps absolute top-4 left-0 text-soft">You</span>
        </div>
        <p class="caps text-ink">{hours.value}</p>
        <PassSky ends={ends.value} index={index.value} pass={props.pass} />
      </div>
    )
  },
  { name: 'PassReadout', props: ['pass'] }
)
