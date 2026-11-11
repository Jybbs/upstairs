<script setup lang="ts">
import { computed } from 'vue'

import { BOUNDS, boundOf, crossingOf } from '../lib/orbit/compass.ts'
import { KINDS, NOTES }                from '../lib/orbit/kinds.ts'
import { kindColor }                   from '../lib/site/palette.ts'
import { sky }                         from '../lib/state/sky.ts'

const about = computed(() => {
  if (!pass.value) return ''
  const docked = sky.tracks.attached.get(pass.value.id) ?? 0
  const note   = NOTES[pass.value.id] ?? KINDS[pass.value.kind].about
  return docked
    ? `${note} Flying with ${docked} docked ${docked === 1 ? 'craft or module' : 'craft and modules'}.`
    : note
})
const heading = computed(() => {
  if (!pass.value) return ''
  const { arrow, label } = BOUNDS[boundOf(pass.value)]
  return `${arrow} ${label}`
})
const empty = computed(() => {
  if (sky.expired.value) return 'The orbits are too old to draw'
  return sky.done.value ? 'No satellite matches these filters' : 'Tracing passes'
})
const pass  = sky.focus

const distance = (kilometers: number) => `${Math.round(kilometers).toLocaleString()} km`
</script>

<template>
  <section class="flex h-[218px] shrink-0 flex-col border-b border-rule bg-lift p-4" aria-live="polite">
    <template v-if="pass">
      <p class="caps flex justify-between text-soft">
        <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full" :style="{ background: kindColor(pass.kind) }" />{{ KINDS[pass.kind].label }}</span>
        <span>No. {{ pass.id }}</span>
      </p>
      <h2 class="mt-1.5 truncate font-display text-[1.65rem] leading-tight">{{ pass.name }}</h2>
      <p class="caps text-soft">{{ heading }}</p>
      <p class="mt-1.5 line-clamp-2 h-10 text-sm leading-5">{{ about }}</p>
      <dl class="mt-auto grid grid-cols-3 gap-2 border-t border-rule pt-2">
        <div>
          <dt class="caps text-soft">Highest</dt>
          <dd class="caps text-ink">{{ Math.round(pass.peak) }}° at {{ sky.clockOf(pass.peakAt) }}</dd>
        </div>
        <div>
          <dt class="caps text-soft">Crosses</dt>
          <dd class="caps text-ink">{{ crossingOf(pass) }}</dd>
        </div>
        <div>
          <dt class="caps text-soft">Altitude</dt>
          <dd class="caps text-ink">{{ distance(pass.height) }}</dd>
        </div>
      </dl>
    </template>
    <p v-else class="caps text-soft">{{ empty }}</p>
  </section>
</template>
