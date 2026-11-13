<script setup lang="ts">
import { computed } from 'vue'

import { usePhone }    from '../lib/site/phone.ts'
import { sky }         from '../lib/state/sky.ts'
import Entries         from './Entries.vue'
import Filters         from './Filters.vue'
import Focus           from './Focus.vue'
import PassList        from './PassList.vue'
import Readout         from './Readout.vue'
import Sheet           from './Sheet.vue'
import SkyMap          from './SkyMap.vue'
import SpotChooser     from './SpotChooser.vue'
import Stamp           from './Stamp.vue'
import TimeStrip       from './TimeStrip.vue'

const phone = usePhone()
/**
 * Whether the spot chooser stands over the map, the readout's card and the
 * strip fading where they stand until the map lands.
 */
const away = computed(() => sky.choosing.value !== 'shut')
</script>

<template>
  <main>
    <h1 class="sr-only">Upstairs</h1>
    <div class="relative h-[calc(100dvh-var(--vp-nav-height))] overflow-hidden">
      <SkyMap />
      <div
        class="contents [&>*]:transition-[opacity,translate] [&>*]:duration-500
               motion-reduce:[&>*]:transition-none"
        :class="away && '[&>*]:pointer-events-none [&>*]:-translate-y-2 [&>*]:opacity-0 [&>*]:duration-250'"
        :inert="away"
      >
        <Sheet v-if="phone" />
        <template v-else>
          <Readout class="absolute top-4 left-4 z-10 w-readout" />
          <TimeStrip class="absolute inset-x-4 bottom-4 z-10 rounded-sm border shadow-lift" />
        </template>
      </div>
      <Transition
        enter-from-class="translate-y-[calc(100%+8px)]"
        enter-active-class="transition-transform duration-620 ease-out motion-reduce:transition-none"
        leave-active-class="transition-transform duration-450 ease-in motion-reduce:transition-none"
        leave-to-class="translate-y-[calc(100%+8px)]"
      >
        <SpotChooser
          v-if="sky.choosing.value === 'open'"
          class="absolute bottom-0 z-20 max-sm:inset-x-0 sm:left-4 sm:w-readout"
        />
      </Transition>
    </div>
    <template v-if="!phone">
      <div class="grid border-t border-rule lg:grid-cols-[400px_minmax(0,1fr)]">
        <div class="border-rule lg:border-r">
          <Focus />
          <Filters />
        </div>
        <PassList />
      </div>
      <Entries />
      <Stamp />
    </template>
  </main>
</template>
