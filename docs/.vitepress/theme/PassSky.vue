<script setup lang="ts">
import { computed } from 'vue'

import { bearingOf, pointOf }    from '../lib/orbit/compass.ts'
import { TRACK_STEP, type Pass } from '../lib/orbit/scan.ts'
import { clamp }                 from '../lib/site/motion.ts'
import { kindColor }             from '../lib/site/palette.ts'
import { sky }                   from '../lib/state/sky.ts'

const { ends, index, pass } = defineProps<{ ends: readonly [number, number], index: number, pass: Pass }>()

/**
 * The sky's size and the radius of its rim in pixels, the length of the rise
 * tick in from the rim and out past it, and the length of the arrowhead.
 */
const SKY = { head: 8, in: 9, out: 3, rim: 39, size: 108 } as const
const CENTER = SKY.size / 2

/**
 * Returns the point `offset` pixels out from the rim at `azimuth` degrees.
 */
const rimAt = (azimuth: number, offset: number): [number, number] => {
  const turn = azimuth * Math.PI / 180
  return [CENTER + (SKY.rim + offset) * Math.sin(turn), CENTER - (SKY.rim + offset) * Math.cos(turn)]
}

/**
 * Returns the point of the plan for a satellite at `bearing` degrees standing
 * `elevation` degrees up, with the rim the horizon and the center straight
 * overhead.
 */
const plotOf = ({ bearing, elevation }: { bearing: number, elevation: number }) =>
  rimAt(bearing, -clamp(elevation, 0, 90) / 90 * SKY.rim)

const LETTERS = (['N', 'E', 'S', 'W'] as const).map((letter, turn) => {
  const [x, y] = rimAt(turn * 90, 9)
  return { letter, x, y }
})

const color = computed(() => kindColor(pass.kind))
/**
 * The moment the needle points at, meaning the time read while the pass is up,
 * its rise before it, and its set after it.
 */
const aimed = computed(() => clamp(sky.at.value, ...ends))
/**
 * The bearing the needle shows in degrees, beside how high the satellite
 * stands there.
 */
const look   = computed(() => lookAt(aimed.value))
const needle = computed(() => plotOf(look.value))
const point  = computed(() => pointOf(look.value.bearing))
const rises  = computed(() => sky.at.value < pass.riseAt)
const up     = computed(() => !rises.value && sky.at.value <= pass.setAt)
/**
 * What the bearing's second line reads: how high the satellite stands while
 * up, or that it rises or has set.
 */
const standing = computed(() => {
  if (rises.value) return 'Rises'
  if (!up.value) return 'Set'
  return `${Math.round(Math.max(look.value.elevation, 0))}° up`
})
const flown = computed(() => traceOf(ends[0], Math.min(sky.at.value, ends[1])))
const ahead = computed(() => traceOf(Math.max(sky.at.value, ends[0]), ends[1]))
/**
 * The tick in from the rim where the pass rises, while it rises in the window.
 */
const rise = computed(() => {
  if (pass.earlier) return null
  const [x, y] = rimAt(pass.riseAz, -SKY.in)
  const [u, v] = rimAt(pass.riseAz, SKY.out)
  return `M${x} ${y}L${u} ${v}`
})
/**
 * The arrowhead on the rim where the pass sets, pointing the way it travels,
 * while it sets in the window.
 */
const set = computed(() => {
  if (pass.later) return null
  const [fromX, fromY] = planAt(pass.setAt - 20)
  const [x, y]         = rimAt(pass.setAz, 0)
  const length         = Math.hypot(x - fromX, y - fromY) || 1
  const [u, v]         = [(x - fromX) / length, (y - fromY) / length]
  const [back, side]   = [SKY.head, SKY.head * 0.62]
  return `M${x + u * 1.5} ${y + v * 1.5}L${x - u * back - v * side} ${y - v * back + u * side}`
       + `L${x - u * back + v * side} ${y - v * back - u * side}Z`
})

/**
 * Returns the bearing in degrees of the satellite from the spot at `seconds`,
 * beside how high it stands.
 */
const lookAt = (seconds: number) => {
  const { tracks } = sky
  tracks.at(index, seconds)
  return {
    bearing   : bearingOf(sky.spot.value, tracks.latitude, tracks.longitude),
    elevation : tracks.elevation
  }
}

/**
 * Returns where the satellite stands in the sky at `seconds`, as a point of
 * the plan.
 */
const planAt = (seconds: number) => plotOf(lookAt(seconds))

/**
 * Returns the path of the pass between two moments, through each track sample
 * between them.
 */
const traceOf = (from: number, to: number) => {
  if (to - from < 1) return ''
  const points = [planAt(from)]
  for (let seconds = Math.ceil(from / TRACK_STEP) * TRACK_STEP; seconds < to; seconds += TRACK_STEP)
    points.push(planAt(seconds))
  points.push(planAt(to))
  return `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}`
}
</script>

<template>
  <div class="flex items-center gap-3.5">
    <svg
      :viewBox="`0 0 ${SKY.size} ${SKY.size}`"
      :width="SKY.size"
      :height="SKY.size"
      class="shrink-0 overflow-visible"
      role="img"
      :aria-label="`The pass across the sky from the spot, its needle pointing ${point}`"
    >
      <circle :cx="CENTER" :cy="CENTER" :r="SKY.rim / 2" class="fill-none stroke-rule" />
      <circle :cx="CENTER" :cy="CENTER" :r="SKY.rim" class="fill-none stroke-soft stroke-[1.25]" />
      <text
        v-for="{ letter, x, y } in LETTERS"
        :key="letter"
        :x="x"
        :y="y"
        dy="0.35em"
        text-anchor="middle"
        class="caps"
        :class="letter === 'N' ? 'fill-ink' : 'fill-soft'"
      >{{ letter }}</text>
      <line
        :x1="CENTER"
        :y1="CENTER"
        :x2="needle[0]"
        :y2="needle[1]"
        class="stroke-soft"
        :stroke-dasharray="up ? undefined : '2 3'"
      />
      <circle :cx="CENTER" :cy="CENTER" r="2" class="fill-soft" />
      <g fill="none" :stroke="color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path :d="flown" stroke-opacity="0.4" />
        <path :d="ahead" />
        <path v-if="rise" :d="rise" />
      </g>
      <path v-if="set" :d="set" :fill="color" />
      <circle
        v-if="up"
        :cx="needle[0]"
        :cy="needle[1]"
        r="4"
        :fill="color"
        class="stroke-panel stroke-[1.75]"
      />
      <circle
        v-else-if="rises"
        :cx="needle[0]"
        :cy="needle[1]"
        r="3.5"
        fill="none"
        :stroke="color"
        stroke-width="1.5"
      />
    </svg>
    <p class="grid gap-1">
      <span class="font-mono text-[30px] leading-none font-medium tracking-wide">{{ point }}</span>
      <span class="caps text-soft">{{ String(Math.round(look.bearing) % 360).padStart(3, '0') }}°</span>
      <span class="caps text-soft">{{ standing }}</span>
    </p>
  </div>
</template>
