<script setup lang="ts">
import { HEIGHTS, sky }     from '../lib/state/sky.ts'
import { KINDS, type Kind } from '../lib/orbit/kinds.ts'
import Chip                 from './Chip.vue'

const kinds = Object.entries(KINDS) as [Kind, (typeof KINDS)[Kind]][]
</script>

<template>
  <section class="flex shrink-0 flex-col gap-2.5 border-b border-rule p-4">
    <div>
      <h3 class="caps mb-1.5 text-soft">Trace paths for</h3>
      <div class="flex flex-wrap gap-1">
        <Chip v-for="[kind, { label, color }] in kinds" :key="kind" :on="sky.traced[kind]" :color="color" @press="sky.traced[kind] = !sky.traced[kind]; sky.version.value++">{{ label }}</Chip>
      </div>
    </div>
    <div class="flex flex-wrap gap-x-5 gap-y-2.5">
      <div>
        <h3 class="caps mb-1.5 text-soft">Reaching at least</h3>
        <div class="flex gap-1">
          <Chip v-for="height in HEIGHTS" :key="height" :on="sky.lowest.value === height" @press="sky.lowest.value = height">{{ height }}°</Chip>
        </div>
      </div>
      <div>
        <h3 class="caps mb-1.5 text-soft">List passes</h3>
        <div class="flex gap-1">
          <Chip :on="sky.scope.value === 'map'" @press="sky.scope.value = 'map'">On this map</Chip>
          <Chip :on="sky.scope.value === 'sky'" @press="sky.scope.value = 'sky'">In the sky</Chip>
        </div>
      </div>
    </div>
  </section>
</template>
