import { defineComponent } from 'vue'

import { CONTROLS, GRID, type Part } from '../lib/site/guide.ts'

/**
 * The satellites the miniature's map draws, each at its dot with three beads
 * behind it.
 */
const DOTS = [[200, 40], [228, 70], [170, 86], [250, 30], [236, 52], [150, 60]] as const
/**
 * Where each pin of the miniature's strip stands along it.
 */
const PINS = [70, 90, 108, 130, 150, 176, 200, 226, 248] as const

/**
 * Draws the first screen in miniature, the map with the readout, the strip,
 * and the pass list over it, with the control `part` raised in the U and every
 * other control drawn quietly in the panel and the rule.
 */
export default defineComponent(
  (props: { part: Part }) => () => {
    const on   = (part: Part) => props.part === part
    const tone = (part: Part) => on(part) ? 'fill-u' : 'fill-dim'
    const line = (part: Part) => on(part) ? 'stroke-u' : 'stroke-dim'
    const box  = (part: Part, quiet = 'fill-panel stroke-rule') => {
      const [x, y, width, height] = CONTROLS[part].outline
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={part === 'map' ? 0 : 3}
          class={on(part) ? 'locator-raised' : quiet}
        />
      )
    }
    return (
      <svg
        class="locator"
        viewBox={`0 0 ${GRID.width} ${GRID.height}`}
        role="img"
        aria-label={CONTROLS[props.part].caption}
      >
        <rect width={GRID.width} height={GRID.height} class="fill-page" />
        {box('map', 'fill-lift stroke-rule')}
        {DOTS.map(([x, y]) => (
          <g class={tone('map')}>
            <circle cx={x} cy={y} r="1.8" />
            {[1, 2, 3].map(bead => (
              <circle cx={x - bead * 4} cy={y + bead * 2} r={1.1 - bead * 0.2} opacity={1 - bead * 0.25} />
            ))}
          </g>
        ))}
        <rect x="46" y="10" width="228" height="10" rx="3" class="fill-panel stroke-rule" />
        {box('readout')}
        {on('spot')
          ? (
            <g class="fill-u">
              <rect x="52" y="70" width="44" height="10" rx="2" class="locator-raised locator-solid" />
              <rect x="99" y="70" width="11" height="10" rx="2" class="locator-raised locator-solid" />
              <rect x="52" y="30" width="34" height="5" rx="1" />
              <path d="M190 34c-4 0-7 3-7 6 0 5 7 11 7 11s7-6 7-11c0-3-3-6-7-6z" />
              <circle cx="190" cy="40" r="2" class="fill-page" />
            </g>
          )
          : (
            <g class="fill-lift">
              <rect x="52" y="72" width="44" height="7" rx="1" />
              <rect x="99" y="72" width="11" height="7" rx="1" />
            </g>
          )}
        <rect x="54" y="44" width="16" height="12" rx="1" class={tone('readout')} />
        <path d="M54 62v4m7-4v4m7-4v4m7-4v4m7-4v4m7-4v4" class={line('readout')} />
        {box('strip')}
        <path d={PINS.map((x, at) => `M${x} 104v${at % 2 ? 5 : -5}`).join('')} class={line('strip')} />
        {box('list')}
        <path d="M52 132H268M52 142H268M52 152H268" class={on('list') ? 'stroke-u' : 'stroke-rule'} />
      </svg>
    )
  },
  { name: 'Locator', props: ['part'] }
)
