import { defineComponent, ref } from 'vue'

import { KINDS, kindOrder }                from '../lib/orbit/kinds.ts'
import { pressedOf, useKinds, useToggles } from '../lib/site/toggles.ts'
import { HEIGHTS, sky }                    from '../lib/state/sky.ts'
import Chip                                from './Chip.tsx'

/**
 * Sets which kinds the page shows and which passes the list holds, through a
 * group taking several kinds at once, each a mark naming its kind on a tip,
 * and two groups each holding one height and one scope, under a heading that
 * folds them away and opens them again.
 */
export default defineComponent(
  () => {
    const open    = ref(true)
    const traced  = useKinds()
    const heights = useToggles(() => [`${sky.lowest.value}`], value => {
      const height = pressedOf(value, `${sky.lowest.value}`)
      if (height) sky.lowest.value = Number(height)
    })
    const scopes = useToggles(() => [sky.scope.value], value => {
      const scope = pressedOf(value, sky.scope.value)
      if (scope) sky.scope.value = scope as typeof sky.scope.value
    })

    return () => (
      <section class="flex shrink-0 flex-col border-t border-rule bg-lift">
        <h2>
          <button
            type="button"
            class="flex w-full cursor-pointer items-baseline justify-between gap-3 px-4 pt-3.5 pb-3 text-left
                   focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-u"
            aria-expanded={open.value}
            onClick={() => { open.value = !open.value }}
          >
            <span class="font-display text-lg leading-tight font-bold text-ink">Show me</span>{' '}
            <span class="caps flex items-center gap-2 text-soft">
              {sky.showing.value.length} of {kindOrder.length} kinds
              <svg
                viewBox="0 0 16 16"
                width="12"
                height="12"
                aria-hidden="true"
                class={[
                  'transition-transform duration-300 motion-reduce:transition-none',
                  open.value && 'rotate-180'
                ]}
              >
                <path d="M3 10L8 5L13 10" fill="none" stroke="currentColor" stroke-width="1.75" />
              </svg>
            </span>
          </button>
        </h2>
        <div
          class="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: open.value ? '1fr' : '0fr' }}
          inert={!open.value}
        >
          <div class="flex min-h-0 flex-col gap-2.5 overflow-hidden px-4 [&>:last-child]:mb-4">
            <div class="flex flex-wrap gap-1 pt-7" {...traced.value.getRootProps()}>
              {kindOrder.map(kind => (
                <Chip
                  key={kind}
                  on={sky.traced[kind]}
                  kind={kind}
                  tip
                  {...traced.value.getItemProps({ value: kind })}
                >
                  {KINDS[kind].label}
                </Chip>
              ))}
            </div>
            <div class="flex items-center gap-3">
              <h3 class="caps w-16 shrink-0 text-soft">At least</h3>
              <div class="flex gap-1" {...heights.value.getRootProps()}>
                {HEIGHTS.map(height => (
                  <Chip
                    key={height}
                    on={sky.lowest.value === height}
                    {...heights.value.getItemProps({ value: `${height}` })}
                  >
                    {height}°
                  </Chip>
                ))}
              </div>
            </div>
            <div class="flex items-center gap-3">
              <h3 class="caps w-16 shrink-0 text-soft">List</h3>
              <div class="flex gap-1" {...scopes.value.getRootProps()}>
                <Chip on={sky.scope.value === 'map'} {...scopes.value.getItemProps({ value: 'map' })}>
                  On this map
                </Chip>
                <Chip on={sky.scope.value === 'sky'} {...scopes.value.getItemProps({ value: 'sky' })}>
                  In the sky
                </Chip>
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  },
  { name: 'Filters' }
)
