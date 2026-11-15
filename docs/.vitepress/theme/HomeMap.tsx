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
import SkyMap             from './SkyMap.tsx'
import SpotChooser        from './SpotChooser.tsx'
import Stamp              from './Stamp.tsx'
import TimeStrip          from './TimeStrip.tsx'

/**
 * Lays out the home page, the map with the readout and the strip over it, or
 * the sheet on a phone, above the pass list and the sections.
 */
export default defineComponent(
  () => {
    provideChooser()
    const phone = usePhone()
    /**
     * Whether the spot chooser stands over the map, the readout's card and the
     * strip fading where they stand until the map lands.
     */
    const away = computed(() => sky.choosing.value !== 'shut')

    return () => (
      <main>
        <h1 class="sr-only">Upstairs</h1>
        <div class="relative h-[calc(100dvh-var(--vp-nav-height))] overflow-hidden">
          <SkyMap />
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
              ? <Sheet />
              : [
                <Readout class="absolute top-4 left-4 z-10 w-readout" />,
                <TimeStrip class="absolute inset-x-4 bottom-4 z-10 rounded-sm border shadow-lift" />
              ]}
          </div>
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
        </div>
        {!phone.value && [
          <div class="grid border-t border-rule lg:grid-cols-[400px_minmax(0,1fr)]">
            <div class="border-rule lg:border-r">
              <Focus />
              <Filters />
            </div>
            <PassList />
          </div>,
          <Entries />,
          <Stamp />
        ]}
      </main>
    )
  },
  { name: 'HomeMap' }
)
