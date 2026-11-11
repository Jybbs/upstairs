<script setup lang="ts">
import { useElementSize }                             from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { BOUNDS, boundOf }          from '../lib/orbit/compass.ts'
import { kindColor }                from '../lib/site/palette.ts'
import { CLOCK, minuteFormat, sky } from '../lib/state/sky.ts'

const AXIS        = 42
const HEIGHT      = 110
const INSET       = 16
const LABEL_WIDTH = 78
const STEM        = 30
const TICKS       = 6
const cursor      = ref<SVGGElement>()
/**
 * What the round button does next: run the fast-forward from the present,
 * return to the present, or under reduced motion move the held frame on.
 */
const turning     = computed(() => {
  if (sky.reduced) return { label: `Draw the sky ${minuteFormat.format(CLOCK.ahead / 60)} on`, mark: 'step' }
  return sky.clock.value === 'live'
    ? { label: `Run the rest of the hour at ${CLOCK.lapse} times real speed`, mark: 'lapse' }
    : { label: 'Back to now', mark: 'now' }
})
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
    const seconds = index * sky.span / TICKS
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
  return (clientX - left - INSET) / inner.value * sky.span
}

const xOf = (seconds: number) => INSET + seconds / sky.span * inner.value

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
    <p class="caps hidden px-4 pt-2.5 text-right text-soft sm:block">{{ legend }}</p>
    <div class="flex items-center gap-2 pl-4">
      <button
        type="button"
        class="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-rule bg-lift
               text-ink hover:border-soft"
        :aria-label="turning.label"
        @click="sky.turn()"
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path v-if="turning.mark === 'lapse'" d="M.5 1.5v9L6 6zM6 1.5v9L11.5 6z" fill="currentColor" />
          <path
            v-else-if="turning.mark === 'step'"
            d="M1.5 1.5v9L7.5 6zM8.75 1.5h2v9h-2z"
            fill="currentColor"
          />
          <template v-else>
            <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" stroke-width="1.5" />
            <circle cx="6" cy="6" r="1.75" fill="currentColor" />
          </template>
        </svg>
      </button>
      <svg
        ref="strip"
        class="block min-w-0 flex-1 cursor-ew-resize touch-none select-none"
        :height="HEIGHT"
        role="slider"
        tabindex="0"
        aria-label="Time within the window"
        :aria-valuemin="0"
        :aria-valuemax="sky.span"
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
        <g class="pointer-events-none" :transform="`translate(${xOf(sky.now.value)} 0)`">
          <line :y1="AXIS + 3" :y2="AXIS + 12" class="stroke-ink" stroke-width="1.5" />
          <text :y="HEIGHT - 20" text-anchor="middle" class="caps fill-ink">Now</text>
        </g>
        <g ref="cursor" class="pointer-events-none">
          <line :y1="4" :y2="HEIGHT - 20" class="stroke-u" stroke-width="1.5" />
          <path d="M-5 2 L5 2 L0 9 Z" class="fill-u" />
        </g>
      </svg>
    </div>
  </section>
</template>
