<script setup lang="ts">
import { BOUNDS, boundOf, crossingOf } from '../lib/orbit/compass.ts'
import { kindColor }                   from '../lib/site/palette.ts'
import { sky }                         from '../lib/state/sky.ts'
</script>

<template>
  <section class="min-h-0 flex-1 xl:overflow-y-auto" aria-label="Passes">
    <p class="caps sticky top-0 z-10 flex justify-between border-b border-rule bg-panel px-4 py-2 text-soft">
      <span>{{ sky.rows.value.list.length + sky.rows.value.more }} passes</span>
      <span>Highest</span>
    </p>
    <ul>
      <li v-for="pass in sky.rows.value.list" :key="pass.id">
        <button
          type="button"
          class="grid h-12 w-full cursor-pointer grid-cols-[4.25rem_1fr_auto] items-center gap-2 border-b border-rule/60 px-4 text-left transition-colors hover:bg-lift"
          :class="{ 'bg-lift': pass.id === sky.selected.value, 'opacity-55': pass.setAt < sky.at.value }"
          :aria-current="pass.id === sky.selected.value"
          @click="sky.focusOn(pass)"
        >
          <span class="caps whitespace-nowrap text-soft">{{ sky.clockOf(pass.peakAt) }}</span>
          <span class="min-w-0">
            <span class="block truncate text-sm leading-tight font-medium">
              <span
                class="mr-1 inline-block size-2 rounded-full"
                :style="{ background: kindColor(pass.kind) }"
              />{{ pass.name }}
            </span>
            <span class="caps block truncate text-soft">{{ BOUNDS[boundOf(pass)].arrow }} {{ crossingOf(pass) }}</span>
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
