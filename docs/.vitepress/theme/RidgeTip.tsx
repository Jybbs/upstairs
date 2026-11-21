import { useElementSize }   from '@vueuse/core'
import { defineComponent, ref } from 'vue'

import type { Pass } from '../lib/orbit/scan.ts'
import { clamp }     from '../lib/site/motion.ts'
import SatelliteName from './SatelliteName.tsx'

/**
 * Draws an angle above the horizon as a ray from the eye under a quarter of
 * the sky.
 */
const Ray = defineComponent(
  (props: { peak: number }) => () => {
    const turn = props.peak * Math.PI / 180
    return (
      <svg viewBox="0 0 14 14" width="14" height="14" class="shrink-0 text-ink" aria-hidden="true">
        <path d="M1 13H13M13 13A12 12 0 0 0 1 1" fill="none" stroke="currentColor" stroke-opacity=".45" />
        <path
          d={`M1 13L${(1 + 12 * Math.cos(turn)).toFixed(2)} ${(13 - 12 * Math.sin(turn)).toFixed(2)}`}
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="1.5"
        />
      </svg>
    )
  },
  { name: 'Ray', props: ['peak'] }
)

/**
 * Names the raised pass's satellite and its highest angle on a tip standing
 * on the strip's top edge over the ridge's peak at `x`, its notch pointing
 * down to the peak, held inside the strip's `width`.
 */
export default defineComponent(
  (props: { pass: Pass | null, width: number, x: number }) => {
    const tip       = ref<HTMLElement>()
    const { width } = useElementSize(tip, { height: 0, width: 0 }, { box: 'border-box' })

    return () => {
      const left = clamp(props.x - width.value / 2, 0, Math.max(props.width - width.value, 0))
      return (
        <div
          ref={tip}
          role="status"
          class={['pointer-events-none absolute bottom-full mb-2 max-w-full', !props.pass && 'invisible']}
          style={{ left: `${left}px` }}
        >
          {props.pass && (
            <div class="relative rounded-sm border border-rule bg-lift px-2 py-1 shadow-lift">
              <span class="flex flex-col items-start gap-x-2 sm:flex-row sm:items-center">
                <span class="caps whitespace-nowrap text-ink"><SatelliteName name={props.pass.name} /></span>
                <span class="sr-only">, </span>
                <span class="flex items-center gap-1.5">
                  <span class="hidden lg:inline"><Ray peak={props.pass.peak} /></span>
                  <span class="caps whitespace-nowrap text-ink">Highest {Math.round(props.pass.peak)}°</span>
                </span>
              </span>
              <span
                class="absolute top-full size-2 -translate-x-1/2 -translate-y-1 rotate-45 border-r border-b
                       border-rule bg-lift"
                style={{ left: `${props.x - left}px` }}
              />
            </div>
          )}
        </div>
      )
    }
  },
  { name: 'RidgeTip', props: ['pass', 'width', 'x'] }
)
