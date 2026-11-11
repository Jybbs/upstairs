<script setup lang="ts">
/**
 * Draws how many element sets in the catalog stand at each age, on an axis
 * that opens up the first day, shaded by the ring each age takes on the map
 * with that ring drawn over its shade.
 */
import { useElementSize }                 from '@vueuse/core'
import { computed, onBeforeUnmount, ref } from 'vue'

import { RING, SPREADS, ringGapOf, spreadOf } from '../lib/map/overlay.ts'
import { AGES }                                from '../lib/orbit/catalog.ts'
import { clamp }                               from '../lib/site/motion.ts'
import { Slider }                              from '../lib/site/slider.ts'
import { useDrawings }                         from '../lib/state/drawings.ts'
import Readings                                from './Readings.vue'

const BINS   = 48
const BOTTOM = 210
const HEIGHT = 250
const INSET  = 16
const LAST   = AGES.limit + 1
const OPEN   = 8
const RISE   = 54
const TOP    = 110
const REACH  = Math.log1p(LAST * OPEN)
const EDGES  = [0, ...SPREADS, AGES.limit]
const BANDS  = [...EDGES, LAST].slice(1).map((to, index) => {
  const [from, middle] = [EDGES[index], (EDGES[index] + to) / 2]
  const shade          = from >= AGES.limit ? 'fill-soft opacity-20'
    : spreadOf(middle) === 2 ? 'fill-lift'
    : 'fill-lift opacity-45'
  return { from, middle, shade, to }
})
const BOUNDS = Array.from({ length: BINS + 1 }, (_, index) => Math.expm1(index / BINS * REACH) / OPEN)

const drawings = useDrawings()
const frame    = ref<HTMLElement>()
const size     = useElementSize(frame)
const width    = computed(() => Math.round(size.width.value))

const shares = computed(() => {
  const ages   = drawings.value?.ages ?? new Float64Array()
  const counts = Array.from({ length: BINS }, () => 0)
  for (const age of ages) if (age >= 0 && age < LAST) counts[Math.floor(alongOf(age) * BINS)]++
  return counts.map(count => count / (ages.length || 1))
})
const slider  = computed(() => new Slider(BINS, shares.value.indexOf(Math.max(...shares.value)), pick))
const columns = computed(() => {
  const tallest = Math.max(...shares.value)
  return shares.value.map((share, index) => {
    const height     = share / tallest * (BOTTOM - TOP - 8)
    const [from, to] = [x(BOUNDS[index]), x(BOUNDS[index + 1])]
    return { height, width: Math.max(1, to - from - 1), x: from + 0.5, y: BOTTOM - height }
  })
})
const rings = computed(() => {
  const ringed = BANDS.filter(band => band.from < AGES.limit)
  const radius = Math.min(34, ...ringed.map(band => (x(band.to) - x(band.from)) / 2 - 8))
  return ringed.map(band => ({
    cx     : (x(band.from) + x(band.to)) / 2,
    dash   : `0 ${ringGapOf(2 * Math.PI * radius, band.middle)}`,
    radius : radius
  }))
})

const readings = computed(() => {
  const index = slider.value.index.value
  return [
    { label: 'Orbit age', longest: '10.0 TO 15.0 D', value: spanOf(BOUNDS[index], BOUNDS[index + 1]) },
    { label: 'Of the catalog', longest: '100%', value: drawings.value ? percent(shares.value[index]) : '' }
  ]
})

/**
 * Returns how far along the axis `age` days stands, from 0 at no age to 1 a day
 * past the limit.
 */
const alongOf = (age: number) => Math.log1p(age * OPEN) / REACH

const percent = (share: number) => `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`

const pick = (px: number) => Math.floor(clamp((px - INSET) / (width.value - 2 * INSET), 0, 0.9999) * BINS)

const spanOf = (low: number, high: number) => {
  if (high < 1 / 24) return `${Math.round(low * 1440)} TO ${Math.round(high * 1440)} MIN`
  if (high < 1) return `${Math.round(low * 24)} TO ${Math.round(high * 24)} H`
  return `${low.toFixed(1)} TO ${high.toFixed(1)} D`
}

const spoken = (index: number) =>
  `${BOUNDS[index].toFixed(2)} to ${BOUNDS[index + 1].toFixed(2)} days, ${percent(shares.value[index])}`

const x = (age: number) => INSET + alongOf(age) * (width.value - 2 * INSET)

onBeforeUnmount(() => slider.value.leave())
</script>

<template>
  <figure ref="frame" class="panel">
    <svg
      class="drawing cursor-pointer"
      :width="width"
      :height="HEIGHT"
      :viewBox="`0 0 ${width} ${HEIGHT}`"
      aria-label="Ages in the catalog"
      :aria-valuetext="drawings && spoken(slider.index.value)"
      v-bind="slider.attributes"
      v-on="slider.events"
    >
      <g v-if="drawings && width">
        <rect
          v-for="band in BANDS"
          :key="band.from"
          :x="x(band.from)"
          :y="TOP"
          :width="x(band.to) - x(band.from)"
          :height="BOTTOM - TOP"
          :class="band.shade"
        />
        <g v-for="ring in rings" :key="ring.cx">
          <circle :cx="ring.cx" :cy="RISE" :r="ring.radius + 10" class="fill-lift" />
          <circle
            :cx="ring.cx"
            :cy="RISE"
            :r="ring.radius"
            class="fill-none stroke-panel [stroke-linecap:round]"
            :stroke-width="RING.halo"
            :opacity="RING.alpha"
            :stroke-dasharray="ring.dash"
          />
          <circle
            :cx="ring.cx"
            :cy="RISE"
            :r="ring.radius"
            class="fill-none [stroke-linecap:round]"
            :stroke="drawings?.color"
            :stroke-width="RING.width"
            :stroke-dasharray="ring.dash"
          />
          <circle
            :cx="ring.cx"
            :cy="RISE"
            r="6.5"
            class="stroke-panel stroke-[2.5]"
            :fill="drawings?.color"
          />
        </g>
        <rect
          v-for="(column, index) in columns"
          :key="index"
          v-bind="column"
          :class="index === slider.index.value ? 'fill-ink' : 'fill-dim'"
        />
        <path :d="`M${INSET} ${BOTTOM}H${width - INSET}`" class="axis" />
        <g v-for="edge in EDGES" :key="edge">
          <path :d="`M${x(edge)} ${BOTTOM}v6`" class="axis" />
          <text
            :x="x(edge)"
            :y="BOTTOM + 24"
            class="caps fill-soft text-base"
            :text-anchor="edge ? 'middle' : 'start'"
          >{{ edge }}</text>
        </g>
      </g>
    </svg>
    <Readings :readings="readings" />
  </figure>
</template>
