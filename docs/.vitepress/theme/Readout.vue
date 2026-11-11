<script setup lang="ts">
import { computed } from 'vue'

import { sky }     from '../lib/state/sky.ts'
import PlaceSearch from './PlaceSearch.vue'

const coordinates = computed(() => {
  const { latitude, longitude } = sky.spot.value
  return `${Math.abs(latitude).toFixed(2)}° ${latitude >= 0 ? 'N' : 'S'}, `
       + `${Math.abs(longitude).toFixed(2)}° ${longitude >= 0 ? 'E' : 'W'}`
})
const dateFormat = new Intl.DateTimeFormat([], { day: 'numeric', month: 'long', weekday: 'long' })
const dated      = computed(() => later.value
  ? `The time read is on ${sky.dayOf(sky.at.value, dateFormat)}.`
  : '')
const days          = computed(() => Math.floor(sky.age.value))
const later         = computed(() => sky.laterDay(sky.at.value))
const over          = computed(() => sky.place.value ?? coordinates.value)
const placed        = computed(() => sky.loaded.value && !sky.expired.value)
const tally         = (count: number) => sky.expired.value ? '—' : sky.done.value ? count : '···'
const weekday       = computed(() => later.value ? sky.dayOf(sky.at.value, weekdayFormat) : '')
const weekdayFormat = new Intl.DateTimeFormat([], { weekday: 'short' })
</script>

<template>
  <section class="flex flex-col gap-3 rounded-sm border border-rule bg-panel/95 p-4 backdrop-blur-sm">
    <PlaceSearch />
    <div>
      <p class="flex items-baseline gap-2">
        <output class="font-display text-5xl leading-none tabular-nums" aria-live="off">{{ placed ? sky.up.value.toLocaleString() : sky.expired.value ? '—' : '···' }}</output>
        <span class="text-sm leading-tight">satellites above the horizon</span>
      </p>
      <p class="mt-1 truncate text-sm text-soft">
        over {{ over }} at
        <span v-if="weekday" class="text-ink">{{ weekday }}</span>
        {{ sky.clockOf(sky.at.value) }} your time
      </p>
      <p class="sr-only" aria-live="polite">{{ sky.spoken.value }}</p>
      <p class="sr-only" aria-live="polite">{{ dated }}</p>
    </div>
    <dl class="grid grid-cols-2 gap-x-3 border-t border-rule pt-2">
      <div>
        <dt class="caps text-soft">Nearly straight up</dt>
        <dd class="caps text-sm! text-ink">{{ tally(sky.nearly.value) }}</dd>
      </div>
      <div>
        <dt class="caps text-soft">Starlink</dt>
        <dd class="caps text-sm! text-ink">{{ tally(sky.starlink.value) }}</dd>
      </div>
    </dl>
    <p class="caps h-3 text-soft">
      <template v-if="sky.failed.value">The catalog did not load</template>
      <template v-else-if="sky.expired.value">Orbits {{ days }} days old, too old to draw</template>
      <template v-else-if="!sky.done.value">Tracing passes {{ Math.round(sky.share.value * 100) }}%</template>
      <template v-else-if="sky.freshness.value === 'aging'">Orbits {{ days }} days old, positions may drift</template>
      <template v-else>Click the map to move the spot</template>
    </p>
  </section>
</template>
