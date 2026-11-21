import { defineComponent, type SlotsType } from 'vue'

import type { Kind } from '../lib/orbit/kinds.ts'
import Icon          from './Icon.tsx'

/**
 * Draws a pressable chip naming one choice, carrying the mark of its kind
 * where it names one. Under `tip` the chip shows the mark alone, its name on a
 * tip above it while a pointer rests on it or the keyboard focuses it.
 */
export default defineComponent(
  (props: { on: boolean, kind?: Kind, tip?: boolean }, { emit, slots }) => () => (
    <button
      type="button"
      aria-pressed={props.on}
      class={[
        'caps group relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border px-2',
        'transition-colors max-sm:h-11',
        props.on
          ? 'border-ink bg-ink text-panel'
          : 'border-rule bg-lift text-soft hover:border-soft hover:text-ink'
      ]}
      onClick={() => emit('press')}
    >
      {props.kind && (
        <Icon name={props.kind} style={props.on ? { color: 'var(--color-panel)' } : undefined} />
      )}
      {props.tip
        ? (
          <span
            class="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 rounded-sm border border-rule
                   bg-lift px-1.5 py-0.5 whitespace-nowrap text-ink opacity-0 shadow-lift transition-opacity
                   group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {slots.default()}
          </span>
        )
        : slots.default()}
    </button>
  ),
  {
    emits : { press: () => true },
    name  : 'Chip',
    props : ['on', 'kind', 'tip'],
    slots : Object as SlotsType<{ default: () => unknown }>
  }
)
