import { defineComponent } from 'vue'

import { KINDS, type Kind } from '../lib/orbit/kinds.ts'
import Icon                 from './Icon.tsx'

/**
 * Names a kind of satellite beside its mark.
 */
export default defineComponent(
  (props: { kind: Kind }) => () => (
    <span
      class="caps inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-sm border border-rule bg-lift px-2
             text-ink"
    >
      <Icon name={props.kind} />{KINDS[props.kind].label}
    </span>
  ),
  { name: 'KindTag', props: ['kind'] }
)
