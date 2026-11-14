import * as listbox                         from '@zag-js/listbox'
import { normalizeProps, useMachine }       from '@zag-js/vue'
import { computed, defineComponent, useId } from 'vue'

import { BOUNDS, boundOf, crossingOf } from '../lib/orbit/compass.ts'
import type { Pass }                   from '../lib/orbit/scan.ts'
import { sky }                         from '../lib/state/sky.ts'
import Icon                            from './Icon.tsx'
import SatelliteName                   from './SatelliteName.tsx'

/**
 * Lists the passes the filters keep as a listbox, its one selected row the
 * pass the map follows.
 */
export default defineComponent(
  () => {
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

    return () => (
      <section class="xl:overflow-y-auto" aria-label="Passes">
        <p
          class="caps sticky top-0 z-10 flex justify-between border-b border-rule bg-panel px-4 py-2
                 text-soft"
        >
          <span {...passes.value.getLabelProps()}>
            {sky.rows.value.list.length + sky.rows.value.more} passes
          </span>
          <span>Highest</span>
        </p>
        <ul
          onFocus={highlightSelected}
          onKeydown={refocus}
          {...passes.value.getContentProps()}
          class="group outline-none"
        >
          {sky.rows.value.list.map(pass => (
            <li
              key={pass.key}
              onClick={() => pass === sky.selected.value && sky.focusOn(pass)}
              {...passes.value.getItemProps({ item: pass })}
              class={[
                `grid h-12 w-full cursor-pointer grid-cols-[4.25rem_1fr_auto] items-center gap-2 border-b
                 border-rule/60 px-4 text-left transition-colors hover:bg-lift
                 group-focus-visible:data-highlighted:[outline:4px_auto_-webkit-focus-ring-color]`,
                { 'bg-lift': pass === sky.selected.value, 'opacity-55': pass.setAt < sky.at.value }
              ]}
            >
              <span class="caps whitespace-nowrap text-soft">{sky.clockOf(pass.peakAt)}</span>
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
          ))}
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
      </section>
    )
  },
  { name: 'PassList' }
)
