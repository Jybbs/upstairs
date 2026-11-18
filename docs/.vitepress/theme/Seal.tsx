import { computed, defineComponent, useId } from 'vue'

import { GLYPHS, SEAL, type Source, type Stroke, rimOf } from '../lib/site/seals.ts'
import Strokes                                           from './Strokes.tsx'

/**
 * Draws a seal: two rings in the mark's color, and a glyph in a tinted core,
 * the glyph scaled by `scale` and its strokes drawn under `at`. A source's seal
 * sets a hairline between the rings and the maker and the license round the
 * rim in the mono's caps, its glyph what the source supplies unless `strokes`
 * names another, whereas a seal for no source sets a dotted ring in their
 * place.
 */
export default defineComponent(
  (props: { at?: string, scale?: number, source?: Source, strokes?: readonly Stroke[] }) => {
    const clip = `seal-${useId()}`
    const rim  = computed(() => props.source && rimOf(props.source))

    return () => {
      const { center, clip: radius, core, dot, edge, hair } = SEAL
      const strokes = props.strokes ?? GLYPHS[props.source!.glyph]
      return (
        <svg class="seal" viewBox="0 0 96 96" aria-hidden="true">
          <circle class="seal-edge" cx={center} cy={center} r={edge} />
          {rim.value
            ? <circle class="seal-hair" cx={center} cy={center} r={hair} />
            : <circle class="seal-plain" cx={center} cy={center} r={dot} />}
          <circle class="seal-core" cx={center} cy={center} r={core} />
          {rim.value && (
            <g class="seal-rim">
              {rim.value.letters.map(({ char, rotate, x, y }) => (
                <text transform={`translate(${x} ${y}) rotate(${rotate})`} text-anchor="middle">{char}</text>
              ))}
              {rim.value.dots.map(({ x, y }) => <circle class="seal-dot" cx={x} cy={y} r="1" />)}
            </g>
          )}
          <g class="seal-glyph" transform={`translate(${center} ${center}) scale(${props.scale ?? 1})`}>
            <clipPath id={clip}><circle r={radius} /></clipPath>
            <g transform={props.at}><Strokes clip={clip} strokes={strokes} /></g>
          </g>
        </svg>
      )
    }
  },
  { name: 'Seal', props: ['at', 'scale', 'source', 'strokes'] }
)
