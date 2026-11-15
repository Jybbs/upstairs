import { defineComponent } from 'vue'

import type { Kind }    from '../lib/orbit/kinds.ts'
import { kindColor }    from '../lib/site/palette.ts'
import type { ridgeOf } from '../lib/site/ridges.ts'

/**
 * Draws a climb as a ridge in the color of `kind`, its outline filled with
 * `shade` percent of that color over the panel, its crest stroked `weight`
 * pixels wide and dotted by `dash` where the satellite cannot be seen, and a
 * dot at its peak.
 */
export default defineComponent(
  (props: {
    dash   : string
    kind   : Kind
    ridge  : ReturnType<typeof ridgeOf>
    shade  : number
    weight : number
  }) => () => {
    const color = kindColor(props.kind)
    return (
      <>
        <path d={props.ridge.outline} fill={`color-mix(in oklab, ${color} ${props.shade}%, var(--panel))`} />
        <g
          fill="none"
          stroke={color}
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width={props.weight}
        >
          <path d={props.ridge.seen} />
          <path d={props.ridge.unseen} stroke-dasharray={props.dash} />
        </g>
        <circle
          cx={props.ridge.peak[0]}
          cy={props.ridge.peak[1]}
          r="3.5"
          stroke-width="2"
          class="fill-ink stroke-panel"
        />
      </>
    )
  },
  { name: 'Ridge', props: ['dash', 'kind', 'ridge', 'shade', 'weight'] }
)
