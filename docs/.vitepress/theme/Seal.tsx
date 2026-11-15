import { computed, defineComponent, useId } from 'vue'

import { GLYPHS, SEAL, type Source, rimOf } from '../lib/site/seals.ts'
import Strokes                              from './Strokes.tsx'

/**
 * Draws a source's seal: two rings in the mark's color with a hairline
 * between them, the maker and the license round the rim in the mono's caps,
 * and the glyph of what the source supplies in a tinted core.
 */
export default defineComponent(
  (props: { source: Source }) => {
    const clip = `seal-${useId()}`
    const rim  = computed(() => rimOf(props.source))

    return () => {
      const { center, clip: radius, core, edge, hair } = SEAL
      return (
        <svg class="seal" viewBox="0 0 96 96" aria-hidden="true">
          <circle class="seal-edge" cx={center} cy={center} r={edge} />
          <circle class="seal-hair" cx={center} cy={center} r={hair} />
          <circle class="seal-core" cx={center} cy={center} r={core} />
          <g class="seal-rim">
            {rim.value.letters.map(({ char, rotate, x, y }) => (
              <text transform={`translate(${x} ${y}) rotate(${rotate})`} text-anchor="middle">{char}</text>
            ))}
            {rim.value.dots.map(({ x, y }) => <circle class="seal-dot" cx={x} cy={y} r="1" />)}
          </g>
          <g class="seal-glyph" transform={`translate(${center} ${center})`}>
            <clipPath id={clip}><circle r={radius} /></clipPath>
            <Strokes clip={clip} strokes={GLYPHS[props.source.glyph]} />
          </g>
        </svg>
      )
    }
  },
  { name: 'Seal', props: ['source'] }
)
