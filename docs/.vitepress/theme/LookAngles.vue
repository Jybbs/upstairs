<script setup lang="ts">
/**
 * Draws the day's highest pass of the space station over the home spot in two
 * planes, the azimuth swept clockwise from north in the sky disc and the
 * elevation drawn as the angle above the horizon in the upright plane facing
 * the satellite, each reading set under the plane it is measured in.
 */
import { useElementSize }                 from '@vueuse/core'
import { computed, onBeforeUnmount, ref } from 'vue'

import { pointOf }        from '../lib/orbit/compass.ts'
import type { Look }      from '../lib/orbit/looks.ts'
import { clamp }          from '../lib/site/motion.ts'
import { endsOf, pathOf } from '../lib/site/paths.ts'
import { Slider }         from '../lib/site/slider.ts'
import { useDrawings }    from '../lib/state/drawings.ts'
import Readings           from './Readings.vue'

const RADIANS = Math.PI / 180

const { drawings, failure } = useDrawings()

const frame = ref<HTMLElement>()
const size  = useElementSize(frame)
const width = computed(() => Math.round(size.width.value))

const looks  = computed(() => drawings.value?.highest.looks ?? [])
const peak   = computed(() => nearest(look => -look.elevation))
const shape  = computed(() => {
  const half   = Math.min(width.value / 2, 300)
  const cx     = half / 2
  const cy     = half / 2 + 8
  const radius = half / 2 - 26
  return { cx, cy, half, radius, reach: half - 32, sx: half + 16, sy: cy + radius }
})
const points = computed(() => looks.value.map(look => projected(look)))
const trail  = computed(() => pathOf(points.value) + endsOf(points.value))
const slider = computed(() => new Slider(looks.value.length, peak.value, pick))
const look   = computed<Look | undefined>(() => looks.value[slider.value.index.value])

const readings = computed(() => [
  { label: 'Azimuth', longest: '360° NNW', value: look.value ? azimuthOf(look.value) : '' },
  { label: 'Elevation', longest: '90.0°', value: look.value ? `${look.value.elevation.toFixed(1)}°` : '' }
])

const parts = computed(() => {
  const { cx, cy, radius, reach, sx, sy } = shape.value
  const now                               = look.value
  if (!now) return null
  const lift    = Math.max(0, now.elevation) * RADIANS
  const wedge   = reach * 0.3
  const [x, y]  = points.value[slider.value.index.value]
  const rim     = onDisc(now.azimuth, radius)
  const tip     = [sx + reach * Math.cos(lift), sy - reach * Math.sin(lift)] as const
  return {
    dot    : { cx: x, cy: y },
    needle : pathOf([[cx, cy], rim]),
    side   : { cx: tip[0], cy: tip[1] },
    sight  : pathOf([[sx, sy], tip]),
    sweep  : `M${cx} ${cy - radius}A${radius} ${radius} 0 ${now.azimuth > 180 ? 1 : 0} 1 ${rim[0]} ${rim[1]}`,
    wedge  : `M${sx} ${sy}H${sx + wedge}A${wedge} ${wedge} 0 0 0 `
           + `${sx + wedge * Math.cos(lift)} ${sy - wedge * Math.sin(lift)}Z`
  }
})

const azimuthOf = (look: Look) => `${Math.round(look.azimuth) % 360}° ${pointOf(look.azimuth)}`

const nearest = (score: (look: Look, index: number) => number) => looks.value.reduce((best, look, index) =>
  score(look, index) < score(looks.value[best], best) ? index : best, 0)

/**
 * Returns the point `r` pixels from the center of the sky disc at `azimuth`
 * degrees clockwise from north.
 */
const onDisc = (azimuth: number, r: number): [number, number] => {
  const { cx, cy } = shape.value
  return [cx + r * Math.sin(azimuth * RADIANS), cy - r * Math.cos(azimuth * RADIANS)]
}

/**
 * Returns the look nearest a point on the sky disc, or the look on the side of
 * the peak the slider stands on whose elevation is nearest the angle a point in
 * the upright plane makes above its horizon.
 */
const pick = (x: number, y: number): number => {
  const { cx, sx, sy } = shape.value
  if (x < 2 * cx)
    return nearest((_, index) => Math.hypot(points.value[index][0] - x, points.value[index][1] - y))
  const angle  = clamp(Math.atan2(sy - y, x - sx) / RADIANS, 0, 90)
  const rising = slider.value.index.value <= peak.value
  return nearest((look, index) =>
    (index <= peak.value) === rising ? Math.abs(look.elevation - angle) : Infinity)
}

const projected = (look: Look) =>
  onDisc(look.azimuth, shape.value.radius * (90 - Math.max(0, look.elevation)) / 90)

const spoken = (look: Look) =>
  `Azimuth ${Math.round(look.azimuth) % 360} degrees, elevation ${look.elevation.toFixed(1)} degrees`

onBeforeUnmount(() => slider.value.leave())
</script>

<template>
  <figure ref="frame" class="panel">
    <p v-if="failure" class="caps m-0 text-base text-soft">{{ failure }}</p>
    <template v-else>
      <svg
        class="drawing cursor-pointer"
        :width="2 * shape.half"
        :height="shape.half"
        :viewBox="`0 0 ${2 * shape.half} ${shape.half}`"
        aria-label="The pass across the sky"
        :aria-valuetext="look && spoken(look)"
        v-bind="slider.attributes"
        v-on="slider.events"
      >
        <g v-if="parts && width">
          <circle :cx="shape.cx" :cy="shape.cy" :r="shape.radius" class="fill-lift" />
          <circle
            v-for="elevation in [30, 60]"
            :key="elevation"
            :cx="shape.cx"
            :cy="shape.cy"
            :r="shape.radius * (90 - elevation) / 90"
            class="guide"
          />
          <path
            :d="`M${shape.cx - shape.radius} ${shape.cy}H${shape.cx + shape.radius}`
              + `M${shape.cx} ${shape.cy - shape.radius}V${shape.cy + shape.radius}`"
            class="guide"
          />
          <circle :cx="shape.cx" :cy="shape.cy" :r="shape.radius" class="axis" />
          <text
            :x="shape.cx"
            :y="shape.cy - shape.radius - 8"
            class="caps fill-soft text-base"
            text-anchor="middle"
          >N</text>
          <path :d="parts.sweep" class="fill-none stroke-u stroke-3 [stroke-linecap:round]" />
          <path
            :d="trail"
            class="fill-none stroke-3 [stroke-linecap:round] [stroke-linejoin:round]"
            :stroke="drawings?.color"
          />
          <path :d="parts.needle" class="fill-none stroke-ink stroke-[1.25]" />
          <circle v-bind="parts.dot" r="6.5" class="stroke-panel stroke-[2.5]" :fill="drawings?.color" />
          <path :d="`M${shape.half + 4} ${shape.sy}H${2 * shape.half - 4}`" class="axis" />
          <path
            :d="`M${shape.sx + shape.reach} ${shape.sy}`
              + `A${shape.reach} ${shape.reach} 0 0 0 ${shape.sx} ${shape.sy - shape.reach}`"
            class="guide"
          />
          <path :d="parts.wedge" class="fill-u opacity-25" />
          <path :d="parts.sight" class="fill-none stroke-ink stroke-[1.25]" />
          <circle :cx="shape.sx" :cy="shape.sy" r="4.5" class="fill-u" />
          <circle v-bind="parts.side" r="6.5" class="stroke-panel stroke-[2.5]" :fill="drawings?.color" />
        </g>
      </svg>
      <Readings :readings="readings" />
    </template>
  </figure>
</template>
