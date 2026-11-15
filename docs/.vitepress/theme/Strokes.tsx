import { defineComponent } from 'vue'

import type { Stroke } from '../lib/site/seals.ts'

/**
 * Draws the strokes of a seal's glyph or a chip's mark, each classed by its
 * kind, those marked clipped inside the clip path `clip`.
 */
export default defineComponent(
  (props: { strokes: readonly Stroke[], clip?: string }) => () =>
    props.strokes.map(({ at, clipped, d, kind }) => (
      <path
        class={`pen-${kind}`}
        d={d}
        transform={at}
        clip-path={clipped && props.clip ? `url(#${props.clip})` : undefined}
      />
    )),
  { name: 'Strokes', props: ['strokes', 'clip'] }
)
