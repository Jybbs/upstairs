import { defineComponent } from 'vue'

import { KINDS, kindOrder }      from '../lib/orbit/kinds.ts'
import { pressedOf, useToggles } from '../lib/site/toggles.ts'
import { HEIGHTS, sky }          from '../lib/state/sky.ts'
import Chip                      from './Chip.tsx'

/**
 * Sets which passes the map and the list show, through a group taking several
 * kinds at once and two groups each holding one height and one scope.
 */
export default defineComponent(
  () => {
    const traced = useToggles(() => kindOrder.filter(kind => sky.traced[kind]), value => {
      for (const kind of kindOrder) sky.traced[kind] = value.includes(kind)
      sky.version.value++
    })
    const heights = useToggles(() => [`${sky.lowest.value}`], value => {
      const height = pressedOf(value, `${sky.lowest.value}`)
      if (height) sky.lowest.value = Number(height)
    })
    const scopes = useToggles(() => [sky.scope.value], value => {
      const scope = pressedOf(value, sky.scope.value)
      if (scope) sky.scope.value = scope as typeof sky.scope.value
    })

    return () => (
      <section class="flex shrink-0 flex-col gap-2.5 border-b border-rule p-4">
        <div>
          <h3 class="caps mb-1.5 text-soft">Show passes of</h3>
          <div class="flex flex-wrap gap-1" {...traced.value.getRootProps()}>
            {kindOrder.map(kind => (
              <Chip
                key={kind}
                on={sky.traced[kind]}
                kind={kind}
                {...traced.value.getItemProps({ value: kind })}
              >
                {KINDS[kind].label}
              </Chip>
            ))}
          </div>
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-2.5">
          <div>
            <h3 class="caps mb-1.5 text-soft">Reaching at least</h3>
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
          <div>
            <h3 class="caps mb-1.5 text-soft">List passes</h3>
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
      </section>
    )
  },
  { name: 'Filters' }
)
