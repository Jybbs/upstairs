<script setup lang="ts">
import Filters   from './Filters.vue'
import Focus     from './Focus.vue'
import PassList  from './PassList.vue'
import Readout   from './Readout.vue'
import SkyMap    from './SkyMap.vue'
import Stamp     from './Stamp.vue'
import TimeStrip from './TimeStrip.vue'
</script>

<template>
  <div class="flex min-h-[calc(100dvh-var(--vp-nav-height))] flex-col xl:h-[calc(100dvh-var(--vp-nav-height))] xl:flex-row xl:overflow-hidden">
    <main class="relative flex min-w-0 flex-1 flex-col">
      <h1 class="sr-only">Upstairs</h1>
      <Readout class="z-10 w-full xl:absolute xl:top-4 xl:left-4 xl:w-readout" />
      <div class="relative h-[56vh] min-h-[320px] xl:h-auto xl:min-h-0 xl:flex-1"><SkyMap /></div>
      <TimeStrip />
    </main>
    <aside class="flex w-full shrink-0 flex-col border-l border-rule bg-paper xl:h-full xl:w-[400px]">
      <Focus />
      <Filters />
      <PassList />
      <Stamp />
    </aside>
  </div>
</template>
