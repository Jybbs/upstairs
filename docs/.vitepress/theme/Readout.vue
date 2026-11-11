<script setup lang="ts">
import { onKeyStroke }          from '@vueuse/core'
import { computed, ref, watch } from 'vue'

import { coordinatesOf }                          from '../lib/orbit/compass.ts'
import { KINDS, kindSlots }                       from '../lib/orbit/kinds.ts'
import { CLOCK, minuteFormat, secondFormat, sky } from '../lib/state/sky.ts'
import Icon                                       from './Icon.vue'
import PassReadout                                from './PassReadout.vue'
import PlaceSearch                                from './PlaceSearch.vue'
import Tally                                      from './Tally.vue'

/**
 * Folds the readout into the head of a phone's sheet, the count and the time
 * over the search, where the sheet shows the pinned pass below.
 */
const { folded = false } = defineProps<{ folded?: boolean }>()

const dateFormat = new Intl.DateTimeFormat([], { day: 'numeric', month: 'long', weekday: 'long' })
const dated      = computed(() => later.value
  ? `The time read is on ${sky.dayOf(sky.at.value, dateFormat)}.`
  : '')
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
    kind,
    line : `${KINDS[kind].label} · ${kinds[index].toLocaleString()} of `
         + `${aboveKinds[index].toLocaleString()} up`
  }
})
const over = computed(() => sky.place.value ?? coordinatesOf(sky.spot.value))
/**
 * Whether the spot has moved since the page opened, its name then settling in
 * letter by letter.
 */
const moved = ref(false)
watch(over, () => { moved.value = true })
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
onKeyStroke('Escape', () => { if (sky.choosing.value === 'shut') sky.release() })

const weekdayFormat = new Intl.DateTimeFormat([], { weekday: 'short' })
/**
 * The clock, after the weekday once the time read falls on a later day.
 */
const when = computed(() => {
  const clock = sky.clockOf(sky.at.value, sky.clock.value === 'running' ? secondFormat : undefined)
  return later.value ? `${sky.dayOf(sky.at.value, weekdayFormat)} ${clock}` : clock
})
</script>

<template>
  <section
    class="flex flex-col gap-3"
    :class="folded ? 'px-4 pb-3' : 'rounded-sm border border-rule bg-panel/95 p-4 backdrop-blur-sm'"
  >
    <p class="caps truncate text-soft">
      Above
      <button
        type="button"
        class="caps cursor-pointer text-ink underline decoration-rule underline-offset-4
               hover:decoration-soft"
        :aria-expanded="sky.choosing.value === 'open'"
        :aria-label="`Choose the spot, now ${over}`"
        @click="sky.choose()"
      >
        <Icon name="place" class="-mt-0.5 inline align-middle" />
        <span :key="over">
          <i
            v-for="(letter, index) in over"
            :key="index"
            class="inline-block whitespace-pre not-italic"
            :class="moved && 'motion-safe:animate-settle'"
            :style="{ '--i': index }"
          >{{ letter }}</i>
        </span>
      </button>
      · <span class="text-ink">{{ when }}</span>
    </p>
    <PassReadout v-if="!folded && sky.shown.value" :key="sky.shown.value.key" :pass="sky.shown.value" />
    <template v-else>
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
      <template v-if="!folded">
        <Tally />
        <p class="caps flex h-3 items-center gap-2 text-soft">
          <template v-if="sky.failed.value">The catalog did not load</template>
          <template v-else-if="sky.expired.value">
            Orbits {{ Math.floor(sky.age.value) }} days old, too old to draw
          </template>
          <template v-else-if="!sky.done.value">
            Tracing passes {{ Math.round(sky.share.value * 100) }}%
          </template>
          <template v-else-if="named">
            <Icon :name="named.kind" />{{ named.line }}
          </template>
          <template v-else>Of {{ sky.reading.value.above.toLocaleString() }} above the horizon</template>
        </p>
      </template>
    </template>
    <p class="sr-only" aria-live="polite">{{ sky.spoken.value }}</p>
    <p class="sr-only" aria-live="polite">{{ dated }}</p>
    <PlaceSearch />
  </section>
</template>
