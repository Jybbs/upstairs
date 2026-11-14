import { defineComponent, type SlotsType } from 'vue'

import type { Kind } from '../lib/orbit/kinds.ts'
import Icon          from './Icon.tsx'

/**
 * Draws a pressable chip naming one choice, carrying the mark of its kind
 * where it names one.
 */
export default defineComponent(
  (props: { on: boolean, kind?: Kind }, { emit, slots }) => () => (
    <button
      type="button"
      aria-pressed={props.on}
      class={[
        'caps inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border px-2 transition-colors',
        'max-sm:h-11',
        props.on
          ? 'border-ink bg-ink text-panel'
          : 'border-rule bg-lift text-soft hover:border-soft hover:text-ink'
      ]}
      onClick={() => emit('press')}
    >
      {props.kind && (
        <Icon name={props.kind} style={props.on ? { color: 'var(--color-panel)' } : undefined} />
      )}
      {slots.default()}
    </button>
  ),
  {
    emits : { press: () => true },
    name  : 'Chip',
    props : ['on', 'kind'],
    slots : Object as SlotsType<{ default: () => unknown }>
  }
)
