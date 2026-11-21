import { useMediaQuery }                         from '@vueuse/core'
import { Transition, computed, defineComponent } from 'vue'

import { provideChooser } from '../lib/site/chooser.ts'
import { usePhone }       from '../lib/site/phone.ts'
import { sky }            from '../lib/state/sky.ts'
import Entries            from './Entries.tsx'
import Filters            from './Filters.tsx'
import Focus              from './Focus.tsx'
import PassList           from './PassList.tsx'
import Readout            from './Readout.tsx'
import Sheet              from './Sheet.tsx'
import Sidebar            from './Sidebar.tsx'
import SkyMap             from './SkyMap.tsx'
import SpotChooser        from './SpotChooser.tsx'
import Stamp              from './Stamp.tsx'
import TimeStrip          from './TimeStrip.tsx'

/**
 * Lays out the home page, the map with the readout and the strip over it, or
 * the sheet on a phone, above the sections. On a desktop the chosen pass's
 * card, the pass list, and the filters stand in a sidebar beside the map, and
 * between a phone and a desktop they stand below it.
 */
export default defineComponent(
  () => {
    provideChooser()
    sky.loadOnce()
    const phone   = usePhone()
    const desktop = useMediaQuery('(width >= 64rem)')
    /**
     * Whether the spot chooser stands over the map, the readout's card and the
     * strip fading where they stand until the map lands.
     */
    const away = computed(() => sky.choosing.value !== 'shut')

    const map = () => [
      <SkyMap />,
      <div
        class={[
          'contents [&>*]:transition-[opacity,translate] [&>*]:duration-500',
          'motion-reduce:[&>*]:transition-none',
          away.value && '[&>*]:pointer-events-none [&>*]:-translate-y-2 [&>*]:opacity-0 '
                      + '[&>*]:duration-250'
        ]}
        inert={away.value}
      >
        {phone.value
          ? <Sheet data-label-clear />
          : [
            <Readout class="absolute top-4 left-4 z-10 w-readout" data-label-clear />,
            <TimeStrip
              class="absolute inset-x-4 bottom-4 z-10 rounded-sm border shadow-lift"
              data-label-clear
            />
          ]}
      </div>,
      <Transition
        enterFromClass="translate-y-[calc(100%+8px)]"
        enterActiveClass="transition-transform duration-620 ease-out motion-reduce:transition-none"
        leaveActiveClass="transition-transform duration-450 ease-in motion-reduce:transition-none"
        leaveToClass="translate-y-[calc(100%+8px)]"
      >
        {sky.choosing.value === 'open' && (
          <SpotChooser class="absolute bottom-0 z-20 max-sm:inset-x-0 sm:left-4 sm:w-readout" />
        )}
      </Transition>
    ]

    return () => (
      <main>
        <h1 class="sr-only">Upstairs</h1>
        <Sidebar beside={desktop.value}>{map()}</Sidebar>
        {!phone.value && [
          !desktop.value && (
            <div class="border-t border-rule">
              <Focus />
              <Filters />
              <PassList />
            </div>
          ),
          <Entries />,
          <Stamp />
        ]}
      </main>
    )
  },
  { name: 'HomeMap' }
)
