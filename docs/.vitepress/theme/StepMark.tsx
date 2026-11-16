import { defineComponent } from 'vue'

import type { Step } from '../lib/state/words.ts'

/**
 * Draws one step's mark at `size` pixels: a disc once done, a ring holding the
 * share under way, an empty ring while waiting, and a ring struck through
 * where the step failed.
 */
export default defineComponent(
  (props: { step: Step, size?: number }) => () => {
    const size = props.size ?? 8
    const c    = size / 2
    const r    = c - 0.75
    const d    = r * 0.62
    const ring = (stroke: string) => <circle cx={c} cy={c} r={r} class={stroke} />
    const { mark, share = 0.3 } = props.step
    return (
      <svg
        class="shrink-0 fill-none stroke-[1.5]"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {mark === 'done' && <circle cx={c} cy={c} r={c} class="fill-u stroke-none" />}
        {mark === 'wait' && ring('stroke-dim')}
        {mark === 'now' && [
          ring('stroke-rule'),
          <circle
            cx={c}
            cy={c}
            r={r}
            class="stroke-u"
            pathLength={1}
            stroke-dasharray={`${share} ${1 - share}`}
            stroke-dashoffset={0.25}
          />
        ]}
        {mark === 'fail' && [
          ring('stroke-ink'),
          <path d={`M${c - d} ${c + d}L${c + d} ${c - d}`} class="stroke-ink [stroke-linecap:round]" />
        ]}
      </svg>
    )
  },
  { name: 'StepMark', props: ['step', 'size'] }
)
