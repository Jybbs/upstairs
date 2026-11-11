<script setup lang="ts">
import { useElementSize }                             from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { BOUNDS, boundOf }      from '../lib/orbit/compass.ts'
import { kindColor }            from '../lib/site/palette.ts'
import { SPEEDS, WINDOWS, sky } from '../lib/state/sky.ts'
import Chip                     from './Chip.vue'

const AXIS        = 42
const HEIGHT      = 92
const INSET       = 16
const LABEL_WIDTH = 78
const STEM        = 30
const TICKS       = 6
const cursor      = ref<SVGGElement>()
const inner       = computed(() => width.value - INSET * 2)
const legend      = [BOUNDS.northbound, BOUNDS.southbound]
  .map(({ arrow, label }) => `${arrow} ${label}`)
  .join(' · ')
const pins = computed(() => sky.rows.value.list
  .filter(pass => boundOf(pass) !== 'holding' && !(pass.earlier && pass.later))
  .map(pass => ({
    pass : pass,
    tip  : AXIS + (boundOf(pass) === 'northbound' ? -1 : 1) * (5 + pass.peak / 90 * STEM),
    x    : xOf(pass.peakAt)
  })))
const strip = ref<SVGSVGElement>()
const ticks = computed(() => {
  const every = Math.ceil(LABEL_WIDTH / (inner.value / TICKS))
  return Array.from({ length: TICKS + 1 }, (_, index) => {
    const seconds = index * sky.span.value / TICKS
    return {
      anchor  : index === 0 ? 'start' : index === TICKS ? 'end' : 'middle',
      clock   : index % every === 0 ? sky.clockOf(seconds) : '',
      seconds : seconds,
      x       : xOf(seconds)
    }
  })
})
const { width } = useElementSize(strip, { height: 0, width: 800 })

let request = 0

const drag = (event: PointerEvent) => {
  if (strip.value!.hasPointerCapture(event.pointerId)) sky.seek(secondsAt(event.clientX))
}

const nudge = (event: KeyboardEvent) => {
  const step = { ArrowLeft: -60, ArrowRight: 60, PageDown: -600, PageUp: 600 }[event.key]
  if (!step) return
  event.preventDefault()
  sky.seek(sky.seconds + step)
}

const press = (event: PointerEvent) => {
  strip.value!.setPointerCapture(event.pointerId)
  sky.seek(secondsAt(event.clientX))
}

const secondsAt = (clientX: number) => {
  const { left } = strip.value!.getBoundingClientRect()
  return (clientX - left - INSET) / inner.value * sky.span.value
}

const xOf = (seconds: number) => INSET + seconds / sky.span.value * inner.value

onMounted(() => {
  const loop = () => {
    cursor.value?.setAttribute('transform', `translate(${xOf(sky.seconds)} 0)`)
    request = requestAnimationFrame(loop)
  }
  request = requestAnimationFrame(loop)
})
onBeforeUnmount(() => cancelAnimationFrame(request))
</script>

<template>
  <section class="shrink-0 border-t border-rule bg-panel" aria-label="Time">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pt-2.5">
      <div class="flex gap-1">
        <Chip
          :on="sky.playing.value"
          @press="sky.playing.value = !sky.playing.value"
        >{{ sky.playing.value ? 'Pause' : 'Play' }}</Chip>
        <Chip :on="false" @press="sky.toNow()">Now</Chip>
      </div>
      <div class="flex items-center gap-1">
        <span class="caps text-soft">Speed</span>
        <Chip
          v-for="speed in SPEEDS"
          :key="speed"
          :on="sky.speed.value === speed"
          @press="sky.speed.value = speed"
        >{{ speed }}×</Chip>
      </div>
      <div class="flex items-center gap-1">
        <span class="caps text-soft">Window</span>
        <Chip
          v-for="minutes in WINDOWS"
          :key="minutes"
          :on="sky.minutes.value === minutes"
          @press="sky.setWindow(minutes)"
        >{{ minutes }} min</Chip>
      </div>
      <p class="caps ml-auto hidden text-soft sm:block">{{ legend }}</p>
    </div>
    <svg
      ref="strip"
      class="block w-full cursor-ew-resize touch-none select-none"
      :height="HEIGHT"
      role="slider"
      tabindex="0"
      aria-label="Time within the window"
      :aria-valuemin="0"
      :aria-valuemax="sky.span.value"
      :aria-valuenow="Math.round(sky.at.value)"
      :aria-valuetext="`${sky.clockOf(sky.at.value)}, ${sky.dayOf(sky.at.value)}`"
      @pointerdown="press"
      @pointermove="drag"
      @keydown="nudge"
    >
      <line :x1="INSET" :x2="width - INSET" :y1="AXIS" :y2="AXIS" class="stroke-dim" />
      <g v-for="tick in ticks" :key="tick.seconds">
        <line :x1="tick.x" :x2="tick.x" :y1="AXIS - 3" :y2="AXIS + 3" class="stroke-dim" />
        <text
          :x="tick.x"
          :y="HEIGHT - 5"
          :text-anchor="tick.anchor"
          class="caps fill-soft"
        >{{ tick.clock }}</text>
      </g>
      <g
        v-for="{ pass, x, tip } in pins"
        :key="pass.key"
        class="cursor-pointer"
        @pointerdown.stop="sky.focusOn(pass)"
      >
        <line
          :x1="x"
          :x2="x"
          :y1="AXIS"
          :y2="tip"
          :style="{ stroke: kindColor(pass.kind) }"
          stroke-opacity="0.6"
        />
        <circle
          :cx="x"
          :cy="tip"
          :r="pass === sky.selected.value ? 5 : 2.6"
          :style="{ fill: kindColor(pass.kind) }"
          :class="{ 'stroke-ink': pass === sky.selected.value }"
        />
      </g>
      <g ref="cursor" class="pointer-events-none">
        <line :y1="4" :y2="HEIGHT - 20" class="stroke-u" stroke-width="1.5" />
        <path d="M-5 2 L5 2 L0 9 Z" class="fill-u" />
      </g>
    </svg>
  </section>
</template>
