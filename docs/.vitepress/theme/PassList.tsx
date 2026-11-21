import { useIntersectionObserver }                    from '@vueuse/core'
import * as listbox                                     from '@zag-js/listbox'
import { normalizeProps, useMachine }                   from '@zag-js/vue'
import { computed, defineComponent, ref, useId, watch } from 'vue'

import { BOUNDS, boundOf, crossingOf } from '../lib/orbit/compass.ts'
import type { Pass }                   from '../lib/orbit/scan.ts'
import { kindColor }                   from '../lib/site/palette.ts'
import { openingOf, revealOf }         from '../lib/site/reveal.ts'
import { sky }                         from '../lib/state/sky.ts'
import Icon                            from './Icon.tsx'
import SatelliteName                   from './SatelliteName.tsx'

/**
 * Marks a chosen row with a bar in its kind's color down its left edge, over
 * a tint of that color.
 */
const chosenOf = ({ kind }: Pass) => ({
  background : `color-mix(in oklab, ${kindColor(kind)} var(--chosen-tint), var(--panel))`,
  boxShadow  : `inset 5px 0 0 ${kindColor(kind)}`
})

/**
 * Lists the passes the filters keep as a listbox, its one selected row the
 * pass the map follows, marked by a bar in its kind's color.
 *
 * `boxed` scrolls the rows in a box of their own under the header, over a line
 * telling a reader the list runs on until its last row shows. The box opens
 * scrolled to the next pass to peak, and scrolls a pass pinned anywhere into
 * view.
 */
export default defineComponent(
  (props: { boxed?: boolean }) => {
    const list = ref<HTMLElement>()
    const end  = ref<HTMLElement | null>(null)
    const seen = ref(true)
    useIntersectionObserver(end, ([entry]) => {
      seen.value = Boolean(entry && entry.intersectionRatio > 0.98)
    }, { root: list, threshold: [0, 1] })

    const id      = useId()
    const service = useMachine(listbox.machine, computed(() => ({
      collection    : listbox.collection<Pass>({ itemToValue: pass => pass.key, items: sky.rows.value.list }),
      id            : id,
      value         : sky.selected.value ? [sky.selected.value.key] : [],
      onValueChange : ({ items }: listbox.ValueChangeDetails<Pass>) => {
        if (items[0]) sky.focusOn(items[0])
      }
    })))
    const passes = computed(() => listbox.connect(service, normalizeProps))

    /**
     * Focuses the map again on the selected pass when Enter or Space lands on
     * its row, which the listbox leaves alone since its value stands
     * unchanged, and keeps Space from scrolling the page.
     */
    const refocus = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (event.key === ' ') event.preventDefault()
      const selected = sky.selected.value
      if (selected && passes.value.highlightedValue === selected.key) sky.focusOn(selected)
    }

    /**
     * Highlights the selected pass when the list takes focus, which the
     * listbox skips while it holds a value, so focus shows on its row.
     */
    const highlightSelected = () => {
      const selected = sky.selected.value
      if (selected && !passes.value.highlightedValue) passes.value.highlightValue(selected.key)
    }

    const rowOf = (pass: Pass | null) =>
      pass && list.value?.querySelector<HTMLElement>(`[data-value="${CSS.escape(pass.key)}"]`)

    /**
     * Opens the box on the next pass to peak once the scan has listed its
     * passes, and marks its last row for the line beneath to watch.
     */
    let opened = false
    watch([list, () => sky.rows.value.list, sky.done], () => {
      const box = list.value
      if (!props.boxed || !box) return
      end.value = box.lastElementChild as HTMLElement | null
      if (opened || !sky.done.value) return
      const row = rowOf(sky.rows.value.list.find(pass => pass.peakAt >= sky.at.value) ?? null)
      if (!row) return
      opened        = true
      box.scrollTop = openingOf(row.offsetTop, row.offsetHeight, box.scrollHeight - box.clientHeight)
    }, { flush: 'post' })

    /**
     * Scrolls the pinned pass's row into the box as it is pinned and as the
     * rows change around it, leaving the page where it stands.
     */
    watch([sky.pinned, () => sky.rows.value.list], ([pass]) => {
      const box = list.value
      const row = rowOf(pass)
      if (!props.boxed || !box || !row) return
      const top = revealOf(row.offsetTop, row.offsetHeight, box.scrollTop, box.clientHeight)
      if (top !== null) box.scrollTo({ behavior: sky.reduced ? 'auto' : 'smooth', top: top })
    }, { flush: 'post' })

    return () => (
      <section aria-label="Passes" class={props.boxed && 'flex min-h-0 flex-1 flex-col bg-panel'}>
        <p
          class={[
            'caps z-10 flex justify-between border-b border-rule bg-panel px-4 py-2 text-soft',
            props.boxed ? 'shrink-0' : 'sticky top-0 min-[60rem]:top-(--vp-nav-height)'
          ]}
        >
          <span {...passes.value.getLabelProps()}>
            {sky.rows.value.total} passes
          </span>
          <span>Highest</span>
        </p>
        <ul
          ref={list}
          onFocus={highlightSelected}
          onKeydown={refocus}
          {...passes.value.getContentProps()}
          class={['group outline-none', props.boxed && 'relative min-h-0 flex-1 overflow-y-auto']}
        >
          {sky.rows.value.list.map(pass => {
            const chosen = pass === sky.selected.value
            return (
              <li
                key={pass.key}
                onClick={() => pass === sky.selected.value && sky.focusOn(pass)}
                {...passes.value.getItemProps({ item: pass })}
                class={[
                  `grid h-12 w-full cursor-pointer grid-cols-[4.25rem_1fr_auto] items-center gap-2 border-b
                   border-rule/60 px-4 text-left transition-colors hover:bg-lift
                   group-focus-visible:data-highlighted:[outline:4px_auto_-webkit-focus-ring-color]`,
                  { 'opacity-55': pass.setAt < sky.at.value }
                ]}
                style={chosen ? chosenOf(pass) : undefined}
              >
                <span class={['caps whitespace-nowrap', chosen ? 'text-ink' : 'text-soft']}>
                  {sky.clockOf(pass.peakAt)}
                </span>
                <span class="min-w-0">
                  <span class="flex items-center gap-1.5 truncate text-base leading-tight">
                    <Icon name={pass.kind} />
                    <SatelliteName name={pass.name} class="truncate" />
                  </span>
                  <span class="caps flex items-center gap-1 truncate text-soft">
                    <Icon name={BOUNDS[boundOf(pass)].mark} />
                    {crossingOf(pass)}
                  </span>
                </span>
                <span class="caps text-sm! text-ink">{Math.round(pass.peak)}°</span>
              </li>
            )
          })}
        </ul>
        {sky.rows.value.more
          ? (
            <p class="px-4 py-3 text-sm text-soft">
              And {sky.rows.value.more.toLocaleString()} more. Raise the height or zoom in to narrow the list.
            </p>
          )
          : sky.done.value && !sky.rows.value.list.length && (
            <p class="px-4 py-3 text-sm text-soft">
              No passes match. Lower the height or trace another kind.
            </p>
          )}
        {props.boxed && !seen.value && (
          <p class="caps flex shrink-0 border-t border-rule bg-panel px-4 py-2 text-ink" aria-hidden="true">
            ↓ The list runs on below
          </p>
        )}
      </section>
    )
  },
  { name: 'PassList', props: ['boxed'] }
)
