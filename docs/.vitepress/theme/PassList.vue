<script setup lang="ts">
import { BOUNDS, boundOf, crossingOf } from '../lib/orbit/compass.ts'
import { sky }                         from '../lib/state/sky.ts'
import Icon                            from './Icon.vue'
import SatelliteName                   from './SatelliteName.vue'
</script>

<template>
  <section class="xl:overflow-y-auto" aria-label="Passes">
    <p class="caps sticky top-0 z-10 flex justify-between border-b border-rule bg-panel px-4 py-2 text-soft">
      <span>{{ sky.rows.value.list.length + sky.rows.value.more }} passes</span>
      <span>Highest</span>
    </p>
    <ul>
      <li v-for="pass in sky.rows.value.list" :key="pass.key">
        <button
          type="button"
          class="grid h-12 w-full cursor-pointer grid-cols-[4.25rem_1fr_auto] items-center gap-2 border-b
                 border-rule/60 px-4 text-left transition-colors hover:bg-lift"
          :class="{ 'bg-lift': pass === sky.selected.value, 'opacity-55': pass.setAt < sky.at.value }"
          :aria-current="pass === sky.selected.value"
          @click="sky.focusOn(pass)"
        >
          <span class="caps whitespace-nowrap text-soft">{{ sky.clockOf(pass.peakAt) }}</span>
          <span class="min-w-0">
            <span class="flex items-center gap-1.5 truncate text-base leading-tight">
              <Icon :name="pass.kind" />
              <SatelliteName :name="pass.name" class="truncate" />
            </span>
            <span class="caps flex items-center gap-1 truncate text-soft">
              <Icon :name="BOUNDS[boundOf(pass)].mark" />
              {{ crossingOf(pass) }}
            </span>
          </span>
          <span class="caps text-sm! text-ink">{{ Math.round(pass.peak) }}°</span>
        </button>
      </li>
    </ul>
    <p
      v-if="sky.rows.value.more"
      class="px-4 py-3 text-sm text-soft"
    >And {{ sky.rows.value.more.toLocaleString() }} more. Raise the height or zoom in to narrow the list.</p>
    <p
      v-else-if="sky.done.value && !sky.rows.value.list.length"
      class="px-4 py-3 text-sm text-soft"
    >No passes match. Lower the height or trace another kind.</p>
  </section>
</template>
