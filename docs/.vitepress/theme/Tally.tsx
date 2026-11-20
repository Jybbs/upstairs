import { useElementSize }                              from '@vueuse/core'
import { mergeProps }                                  from '@zag-js/vue'
import { computed, defineComponent, ref, watchEffect } from 'vue'

import { KINDS, kindOrder, type Kind } from '../lib/orbit/kinds.ts'
import { kindColor }                   from '../lib/site/palette.ts'
import { tallyOf }                     from '../lib/site/tally.ts'
import { useKinds }                    from '../lib/site/toggles.ts'
import { sky }                         from '../lib/state/sky.ts'

/**
 * Counts each kind of satellite on the map as a run of ticks, naming a kind a
 * mouse rests on or the keyboard reaches, and switching a kind off at a press.
 */
export default defineComponent(
  () => {
    const bar      = ref<HTMLElement>()
    const focused  = ref<Kind | null>(null)
    const keyed    = ref(false)
    const released = ref(false)
    const rested   = ref<Kind | null>(null)
    const shown    = computed(() => kindOrder
      .map((kind, index) => ({ count: sky.reading.value.kinds[index], kind }))
      .filter(({ count, kind }) => count > 0 || (keyed.value && focused.value === kind)))
    const { width } = useElementSize(bar, { height: 16, width: 320 })
    const fitted    = computed(() => tallyOf(shown.value.map(({ count }) => count), width.value))
    const toggles   = useKinds()

    /**
     * Names a kind once the keyboard reaches its group, leaving a pointer's
     * press to the toggle group, and keeps that group in the tally once its
     * kind is switched off so a second press switches it back on.
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
          class        : 'flex h-4 items-stretch',
          onKeydown    : letGo,
          ref          : bar,
          style        : { '--pitch': `${fitted.value.pitch}px`, '--tick': `${fitted.value.tick}px` },
          tabindex     : shown.value.length ? undefined : -1
        })}
      >
        {shown.value.map(({ count, kind }, index) => (
          <button
            key={kind}
            {...toggles.value.getItemProps({ value: kind })}
            class={[
              `relative flex-none cursor-pointer rounded-[1px]
               bg-[repeating-linear-gradient(90deg,var(--ink-of)_0_var(--tick),transparent_var(--tick)_var(--pitch))]
               transition-[width,opacity] duration-600 ease-[cubic-bezier(.32,.72,0,1)]
               before:absolute before:-inset-y-3.5 before:right-(--reach-right) before:left-(--reach-left)
               before:content-[''] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4
               focus-visible:outline-u motion-reduce:transition-none`,
              { 'opacity-25': sky.named.value && sky.named.value !== kind }
            ]}
            style={{
              '--ink-of'      : kindColor(kind),
              '--reach-left'  : `${-fitted.value.groups[index].left}px`,
              '--reach-right' : `${-fitted.value.groups[index].right}px`,
              marginRight     : `${fitted.value.groups[index].gap}px`,
              width           : `${fitted.value.groups[index].width}px`
            }}
            aria-label={`${KINDS[kind].label}, ${count.toLocaleString()} on this map`}
            onBlur={leave}
            onFocus={(event: FocusEvent) => enter(event, kind)}
            onPointerenter={(event: PointerEvent) => rest(event, kind)}
            onPointerleave={(event: PointerEvent) => rest(event, null)}
          />
        ))}
      </div>
    )
  },
  { name: 'Tally' }
)
