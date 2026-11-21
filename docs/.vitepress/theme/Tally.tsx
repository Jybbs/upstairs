import { mergeProps }                                  from '@zag-js/vue'
import { computed, defineComponent, ref, watchEffect } from 'vue'

import { KINDS, kindOrder, type Kind } from '../lib/orbit/kinds.ts'
import { kindColor }                   from '../lib/site/palette.ts'
import { useKinds }                    from '../lib/site/toggles.ts'
import { sky }                         from '../lib/state/sky.ts'
import Icon                            from './Icon.tsx'

/**
 * Counts each kind of satellite on the map as a row of its mark, its name, a
 * bar on one scale for every row, and its count, naming a kind a mouse rests
 * on or the keyboard reaches, and switching a kind off at a press on its row.
 */
export default defineComponent(
  () => {
    const focused  = ref<Kind | null>(null)
    const keyed    = ref(false)
    const released = ref(false)
    const rested   = ref<Kind | null>(null)
    const shown    = computed(() => kindOrder
      .map((kind, index) => ({ count: sky.reading.value.kinds[index], kind }))
      .filter(({ count, kind }) => count > 0 || (keyed.value && focused.value === kind)))
    const most    = computed(() => Math.max(1, ...shown.value.map(({ count }) => count)))
    const toggles = useKinds('vertical')

    /**
     * Names a kind once the keyboard reaches its row, leaving a pointer's
     * press to the toggle group, and keeps that row in the tally once its kind
     * is switched off so a second press switches it back on.
     */
    const enter = (event: FocusEvent, kind: Kind) => {
      focused.value  = kind
      keyed.value    = (event.target as HTMLElement).matches(':focus-visible')
      released.value = !keyed.value
    }

    const leave = () => {
      focused.value  = null
      keyed.value    = false
      released.value = false
    }

    const letGo = (event: KeyboardEvent) => {
      if (event.key === 'Escape') released.value = true
    }

    const rest = (event: PointerEvent, kind: Kind | null) => {
      if (event.pointerType === 'mouse') rested.value = kind
    }

    watchEffect(() => {
      const named     = rested.value ?? (released.value ? null : focused.value)
      sky.named.value = shown.value.some(({ kind }) => kind === named) ? named : null
    })

    return () => (
      <div
        {...mergeProps(toggles.value.getRootProps(), {
          'aria-label' : 'Kinds on this map',
          class        : 'flex flex-col',
          onKeydown    : letGo,
          tabindex     : shown.value.length ? undefined : -1
        })}
      >
        {shown.value.map(({ count, kind }) => (
          <button
            key={kind}
            {...toggles.value.getItemProps({ value: kind })}
            class={[
              `caps grid h-6 cursor-pointer grid-cols-[auto_12ch_minmax(0,1fr)_7ch] items-center gap-2
               text-left text-ink transition-opacity hover:bg-lift focus:outline-none focus-visible:outline-2
               focus-visible:outline-offset-1 focus-visible:outline-u`,
              { 'opacity-25': sky.named.value && sky.named.value !== kind }
            ]}
            aria-label={`${KINDS[kind].label}, ${count.toLocaleString()} on this map`}
            onBlur={leave}
            onFocus={(event: FocusEvent) => enter(event, kind)}
            onPointerenter={(event: PointerEvent) => rest(event, kind)}
            onPointerleave={(event: PointerEvent) => rest(event, null)}
          >
            <Icon name={kind} />
            <span>{KINDS[kind].label}</span>
            <span
              class={[
                `h-2 rounded-[1px] transition-[width] duration-600 ease-[cubic-bezier(.32,.72,0,1)]
                 motion-reduce:transition-none`,
                { 'min-w-0.5': count > 0 }
              ]}
              style={{ background: kindColor(kind), width: `${count / most.value * 100}%` }}
            />
            <span class="text-right tabular-nums">{count.toLocaleString()}</span>
          </button>
        ))}
      </div>
    )
  },
  { name: 'Tally' }
)
