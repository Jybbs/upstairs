<script setup lang="ts">
import { computed } from 'vue'

import { BOUNDS, boundOf, slantOf } from '../lib/orbit/compass.ts'
import type { Pass }                from '../lib/orbit/scan.ts'
import { kindColor }                from '../lib/site/palette.ts'
import { sky }                      from '../lib/state/sky.ts'
import Icon                         from './Icon.vue'
import KindTag                      from './KindTag.vue'
import PassSky                      from './PassSky.vue'
import SatelliteName                from './SatelliteName.vue'

const { pass } = defineProps<{ pass: Pass }>()

const bound = computed(() => boundOf(pass))
const ends  = computed(() => [Math.max(pass.riseAt, 0), Math.min(pass.setAt, sky.span)] as const)
const index = computed(() => sky.tracks.passes.indexOf(pass))
/**
 * The farthest the satellite stands from the spot while it is up in the
 * window, which the rail's far end marks.
 */
const farthest = computed(() => Math.max(...ends.value.map(seconds => slantAt(seconds) ?? 0)))
/**
 * When the pass stands above the horizon within the window.
 */
const hours = computed(() => {
  const { earlier, later, riseAt, setAt } = pass
  if (earlier && later) return 'Up all hour'
  if (earlier) return `Up until ${sky.clockOf(setAt)}`
  if (later) return `Up from ${sky.clockOf(riseAt)}`
  return `Up ${sky.rangeOf(riseAt, setAt)}`
})
/**
 * Where the satellite stands at the time read, or null while it is down.
 */
const now = computed(() => {
  const seconds = sky.at.value
  if (seconds < pass.riseAt || seconds > pass.setAt) return null
  const range = slantAt(seconds)
  return range === null ? null : { elevation: sky.tracks.elevation, range }
})

/**
 * Returns the share of the rail's length a distance from the spot stands at.
 */
const railAt = (range: number) => `${Math.min(range / (farthest.value || 1), 1) * 100}%`
const nearest = computed(() => railAt(pass.range))

/**
 * Returns the distance from the spot to the satellite at `seconds` into the
 * window, reading its elevation into `sky.tracks`, or null while it is down.
 */
const slantAt = (seconds: number) => sky.tracks.at(index.value, seconds) && sky.tracks.elevation >= 0
  ? slantOf(pass.height, sky.tracks.elevation)
  : null
</script>

<template>
  <div class="flex flex-col gap-2">
    <SatelliteName :name="pass.name" class="text-[22px] leading-tight tracking-tight text-balance text-ink" />
    <p class="flex items-center gap-2">
      <KindTag :kind="pass.kind" />
      <span class="h-px flex-1 bg-rule" />
      <span class="caps inline-flex items-center gap-1 text-soft">
        <Icon :name="BOUNDS[bound].mark" />{{ BOUNDS[bound].label }}
      </span>
    </p>
    <dl
      class="grid grid-cols-[minmax(0,1fr)_auto_auto] [&>div]:flex [&>div]:flex-col-reverse
             [&>div]:justify-end [&>div]:gap-1 [&>div+div]:border-l [&>div+div]:border-rule [&>div+div]:pl-3
             [&_dd]:font-mono [&_dd]:text-2xl [&_dd]:leading-none [&_dd]:font-medium [&_dd]:tabular-nums
             [&_dt]:caps [&_dt]:text-soft"
    >
      <div class="pr-2.5">
        <dt>{{ now ? 'Km away' : 'Km nearest' }}</dt>
        <dd>
          {{ (now ? Math.round(now.range / 10) * 10 : Math.round(pass.range)).toLocaleString() }}
        </dd>
      </div>
      <div class="pr-3">
        <dt>Peaks</dt>
        <dd>{{ Math.round(pass.peak) }}°</dd>
      </div>
      <div class="min-w-[4ch]">
        <dt>Now</dt>
        <dd>
          {{ now ? `${Math.round(now.elevation)}°` : 'Down' }}
        </dd>
      </div>
    </dl>
    <div class="relative h-[34px]" aria-hidden="true">
      <span
        class="absolute top-[3px] left-0 size-2.5 rounded-full border-[1.5px] border-u
               bg-[radial-gradient(circle,var(--u)_0_1.6px,transparent_2px)]"
      />
      <span class="absolute inset-x-0 top-[7.5px] h-px bg-rule" />
      <span class="absolute top-0 right-[5px] left-[18px] h-4">
        <span
          class="absolute top-[3.5px] -ml-[4.5px] size-[9px] rounded-full border-[1.5px] border-soft bg-panel"
          :style="{ left: nearest }"
        />
        <span
          v-if="now"
          class="absolute top-[3px] -ml-[5px] size-2.5 rounded-full"
          :style="{ background: kindColor(pass.kind), left: railAt(now.range) }"
        />
        <span class="caps absolute top-4 -translate-x-1/2 text-soft" :style="{ left: nearest }">Nearest</span>
      </span>
      <span class="caps absolute top-4 left-0 text-soft">You</span>
    </div>
    <p class="caps text-ink">{{ hours }}</p>
    <PassSky :ends="ends" :index="index" :pass="pass" />
  </div>
</template>
