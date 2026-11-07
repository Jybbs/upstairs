<script setup lang="ts">
import Credits from './ui/Credits.vue'
import Filters from './ui/Filters.vue'
import Focus from './ui/Focus.vue'
import PassList from './ui/PassList.vue'
import Readout from './ui/Readout.vue'
import SkyMap from './ui/SkyMap.vue'
import TimeStrip from './ui/TimeStrip.vue'
</script>

<template>
  <div class="flex min-h-dvh flex-col xl:h-dvh xl:flex-row xl:overflow-hidden">
    <main class="relative flex min-w-0 flex-1 flex-col">
      <Readout class="z-10 w-full xl:absolute xl:top-4 xl:left-4 xl:w-[360px]" />
      <div class="relative h-[56vh] min-h-[320px] xl:h-auto xl:min-h-0 xl:flex-1"><SkyMap /></div>
      <TimeStrip />
    </main>
    <aside class="flex w-full shrink-0 flex-col border-l border-rule bg-paper xl:h-full xl:w-[400px]">
      <Focus />
      <Filters />
      <PassList />
      <Credits />
    </aside>
  </div>
</template>
