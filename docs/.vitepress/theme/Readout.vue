<script setup lang="ts">
import { computed } from 'vue'

import { KINDS, kindSlots }                       from '../lib/orbit/kinds.ts'
import { kindColor }                              from '../lib/site/palette.ts'
import { CLOCK, minuteFormat, secondFormat, sky } from '../lib/state/sky.ts'
import PlaceSearch                                from './PlaceSearch.vue'
import Tally                                      from './Tally.vue'

const clock = computed(() =>
  sky.clockOf(sky.at.value, sky.clock.value === 'running' ? secondFormat : undefined))
const coordinates = computed(() => {
  const { latitude, longitude } = sky.spot.value
  return `${Math.abs(latitude).toFixed(2)}° ${latitude >= 0 ? 'N' : 'S'}, `
       + `${Math.abs(longitude).toFixed(2)}° ${longitude >= 0 ? 'E' : 'W'}`
})
const dateFormat = new Intl.DateTimeFormat([], { day: 'numeric', month: 'long', weekday: 'long' })
const dated      = computed(() => later.value
  ? `The time read is on ${sky.dayOf(sky.at.value, dateFormat)}.`
  : '')
const days   = computed(() => Math.floor(sky.age.value))
const figure = computed(() => {
  if (sky.expired.value) return '—'
  return sky.loaded.value ? sky.reading.value.onMap.toLocaleString() : '···'
})
const later = computed(() => sky.laterDay(sky.at.value))
/**
 * The kind the tally names, in its color beside how many of it the map draws
 * of how many stand above the horizon.
 */
const named = computed(() => {
  const kind = sky.named.value
  if (!kind) return null
  const index                 = kindSlots[kind]
  const { aboveKinds, kinds } = sky.reading.value
  return {
    color : kindColor(kind),
    line  : `${KINDS[kind].label} · ${kinds[index].toLocaleString()} of `
          + `${aboveKinds[index].toLocaleString()} up`
  }
})
const over = computed(() => sky.place.value ?? coordinates.value)
/**
 * The tag beside the figure: how far a held frame stands from the present
 * under reduced motion, and otherwise what the clock is doing.
 */
const tag = computed(() => {
  const away = sky.away.value
  if (sky.reduced) return away === 0 ? 'Now' : away < 0 ? `${-away} min ago` : `In ${away} min`
  return { held: 'Paused', live: 'Live', running: `${CLOCK.lapse}× speed` }[sky.clock.value]
})
const tagLabel = computed(() => {
  const away = sky.away.value
  if (!away) return 'The frame is the sky as it is now'
  const minutes = minuteFormat.format(Math.abs(away))
  return `Draw the sky as it is now, the frame is ${minutes} ${away < 0 ? 'behind' : 'ahead'}`
})
const weekdayFormat = new Intl.DateTimeFormat([], { weekday: 'short' })
/**
 * The clock, after the weekday once the time read falls on a later day.
 */
const when = computed(() => later.value
  ? `${sky.dayOf(sky.at.value, weekdayFormat)} ${clock.value}`
  : clock.value)
</script>

<template>
  <section class="flex flex-col gap-3 rounded-sm border border-rule bg-panel/95 p-4 backdrop-blur-sm">
    <p class="caps truncate text-soft">
      Above <span class="text-ink">{{ over }}</span> · <span class="text-ink">{{ when }}</span>
    </p>
    <div class="flex items-baseline gap-2.5">
      <output class="font-mono text-5xl leading-none font-medium tabular-nums" aria-live="off">
        {{ figure }}
      </output>
      <span class="caps text-soft">On this map</span>
      <button
        v-if="sky.reduced"
        type="button"
        class="caps ml-auto cursor-pointer rounded-full border border-rule px-2.5 py-1 whitespace-nowrap
               text-ink hover:border-soft aria-disabled:cursor-default aria-disabled:text-soft"
        :aria-disabled="sky.away.value === 0"
        :aria-label="tagLabel"
        @click="sky.away.value && sky.back()"
      >{{ tag }}</button>
      <span
        v-else
        class="caps ml-auto rounded-full border border-rule px-2.5 py-1 whitespace-nowrap text-ink"
      >{{ tag }}</span>
    </div>
    <Tally />
    <p class="caps flex h-3 items-center gap-2 text-soft">
      <template v-if="sky.failed.value">The catalog did not load</template>
      <template v-else-if="sky.expired.value">Orbits {{ days }} days old, too old to draw</template>
      <template v-else-if="!sky.done.value">Tracing passes {{ Math.round(sky.share.value * 100) }}%</template>
      <template v-else-if="named">
        <span class="size-2 rounded-full" :style="{ background: named.color }" />{{ named.line }}
      </template>
      <template v-else>Of {{ sky.reading.value.above.toLocaleString() }} above the horizon</template>
    </p>
    <p class="sr-only" aria-live="polite">{{ sky.spoken.value }}</p>
    <p class="sr-only" aria-live="polite">{{ dated }}</p>
    <PlaceSearch />
  </section>
</template>
