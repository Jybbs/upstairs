import { defineComponent } from 'vue'

import { type Moment, NAMES, STEPS, type Step } from '../lib/state/words.ts'
import StepMark                                from './StepMark.tsx'

/**
 * The radius of each step's orbit in the drawing's 56-unit box, the catalog
 * outermost.
 */
const RADII = { catalog: 25, map: 9, passes: 17 } as const

/**
 * Draws the steps the map waits on as three orbits around one center, each
 * closing as its step finishes, beside a legend reading each step.
 *
 * At a failure the failed orbit alone stays lit, dashed in ink with the share
 * it reached drawn solid over it, and every other orbit dims.
 */
export default defineComponent(
  (props: { moment: Moment, size: number }) => {
    /**
     * Draws the share `share` of the orbit of radius `r`, clockwise from the
     * top.
     */
    const arc = (r: number, share: number, stroke: string, spins = false) => (
      <circle
        cx="28"
        cy="28"
        r={r}
        class={[stroke, '[stroke-linecap:round]', spins && 'origin-center [transform-box:fill-box] '
          + 'motion-safe:animate-[spin_1.6s_linear_infinite]']}
        pathLength={1}
        stroke-dasharray={`${share} ${1 - share}`}
        stroke-dashoffset={0.25}
      />
    )

    const orbit = (r: number, { mark, share }: Step) => {
      const lit = props.moment.failure ? 'stroke-dim' : 'stroke-u'
      if (mark === 'fail') {
        return [
          <circle cx="28" cy="28" r={r} class="stroke-ink" stroke-dasharray="3 2.5" />,
          share ? arc(r, share, 'stroke-ink') : null
        ]
      }
      if (mark === 'done') return <circle cx="28" cy="28" r={r} class={lit} />
      if (mark === 'wait') {
        return <circle cx="28" cy="28" r={r} class="stroke-dim stroke-1" stroke-dasharray="1.5 3" />
      }
      return [
        <circle cx="28" cy="28" r={r} class="stroke-rule" />,
        share === undefined ? arc(r, 0.28, lit, true) : arc(r, Math.max(share, 0.05), lit)
      ]
    }

    return () => (
      <div class="flex items-center gap-4">
        <svg
          class="shrink-0 fill-none stroke-3"
          width={props.size}
          height={props.size}
          viewBox="0 0 56 56"
          aria-hidden="true"
        >
          {STEPS.map(key => orbit(RADII[key], props.moment[key]))}
          <circle cx="28" cy="28" r="2.5" class="fill-ink stroke-none" />
        </svg>
        <ol class="flex min-w-0 flex-1 flex-col gap-1.5" aria-label="What the map waits on, outermost first">
          {STEPS.map(key => (
            <li key={key} class="flex h-4 items-center gap-2">
              <StepMark step={props.moment[key]} />
              <span class="caps w-[70px] text-ink">{NAMES[key]}</span>
              <span class={['caps truncate', props.moment[key].mark === 'fail' ? 'text-ink' : 'text-soft']}>
                {props.moment[key].reading}
              </span>
            </li>
          ))}
        </ol>
      </div>
    )
  },
  { name: 'Orbits', props: ['moment', 'size'] }
)
