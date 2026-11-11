<script setup lang="ts">
import { useElementSize }                            from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { BOUNDS, boundOf }          from '../lib/orbit/compass.ts'
import type { Pass }                from '../lib/orbit/scan.ts'
import { columnsOf, pickAt }        from '../lib/site/columns.ts'
import { turnOf }                   from '../lib/site/drag.ts'
import type { IconName }            from '../lib/site/icons.ts'
import { kindColor }                from '../lib/site/palette.ts'
import { usePhone }                 from '../lib/site/phone.ts'
import { CLOCK, minuteFormat, sky } from '../lib/state/sky.ts'
import Icon                         from './Icon.vue'

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
const turning     = computed((): { label: string, mark: IconName | 'step' } => {
  if (sky.reduced) return { label: `Draw the sky ${minuteFormat.format(CLOCK.ahead / 60)} on`, mark: 'step' }
  return sky.clock.value === 'live'
    ? { label: `Run the rest of the hour at ${CLOCK.lapse} times real speed`, mark: 'lapse' }
    : { label: 'Back to now', mark: 'now' }
})
const inner       = computed(() => width.value - INSET * 2)
const pins = computed(() => sky.rows.value.list.flatMap(pass => {
  const bound = boundOf(pass)
  if (bound === 'holding' || (pass.earlier && pass.later)) return []
  const tip = AXIS + (bound === 'northbound' ? -1 : 1) * (5 + pass.peak / 90 * STEM)
  return [{ pass, tip, x: xOf(pass.peakAt) }]
}))
const strip = ref<SVGSVGElement>()
const ticks = computed(() => {
  const every = Math.ceil(LABEL_WIDTH / (inner.value / TICKS))
  return Array.from({ length: TICKS + 1 }, (_, index) => {
    const seconds = index * sky.span / TICKS
    return {
      anchor  : index === 0 ? 'start' : index === TICKS ? 'end' : 'middle',
      clock  : index % every === 0 ? sky.clockOf(seconds) : '',
      seconds,
      x      : xOf(seconds)
    }
  })
})
const { width } = useElementSize(strip, { height: 0, width: 800 })
/**
 * The strip cut into columns around the peaks, which a tap on a phone picks
 * from.
 */
const columns = computed(() => columnsOf(pins.value.map(({ pass, x }) => ({ item: pass, x })), width.value))
const phone   = usePhone()

/**
 * Where a press on a phone's strip went down, and whether it has turned into a
 * drag across the strip or up and down it.
 */
let down: { drag: 'across' | 'along' | null, x: number, y: number } | null = null
let request = 0

const drag = (event: PointerEvent) => {
  if (!strip.value!.hasPointerCapture(event.pointerId)) return
  if (down && !down.drag) {
    down.drag = turnOf(down.x, down.y, event)
    if (!down.drag) return
  }
  if (down?.drag !== 'along') sky.seek(secondsAt(event.clientX))
}

/**
 * Picks on a phone the pass a tap lands on, from the column under it.
 */
const lift = (event: PointerEvent) => {
  if (down && !down.drag) {
    const picked = pickAt(columns.value, xAt(event.clientX), sky.pinned.value)
    if (picked) sky.focusOn(picked)
  }
  down = null
}

const nudge = (event: KeyboardEvent) => {
  const step = { ArrowLeft: -60, ArrowRight: 60, PageDown: -600, PageUp: 600 }[event.key]
  if (!step) return
  event.preventDefault()
  sky.seek(sky.seconds + step)
}

const press = (event: PointerEvent) => {
  strip.value!.setPointerCapture(event.pointerId)
  if (phone.value) down = { drag: null, x: event.clientX, y: event.clientY }
  else sky.seek(secondsAt(event.clientX))
}

/**
 * Pins the pass whose peak a pointer presses wider than a phone and moves the
 * clock to its peak, leaving a phone's press to the column under it.
 */
const pressPin = (event: PointerEvent, pass: Pass) => {
  if (phone.value) return
  event.stopPropagation()
  sky.focusOn(pass)
}

/**
 * Returns how far in pixels a pointer at `clientX` stands from the strip's
 * left edge.
 */
const xAt = (clientX: number) => clientX - strip.value!.getBoundingClientRect().left

const secondsAt = (clientX: number) => (xAt(clientX) - INSET) / inner.value * sky.span

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
    <p class="caps hidden items-center justify-end gap-1 px-4 pt-2.5 text-soft sm:flex">
      <Icon :name="BOUNDS.northbound.mark" />{{ BOUNDS.northbound.label }} ·
      <Icon :name="BOUNDS.southbound.mark" />{{ BOUNDS.southbound.label }}
    </p>
    <div class="flex items-center gap-2 pl-4">
      <button
        type="button"
        class="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-rule bg-lift
               text-ink hover:border-soft"
        :aria-label="turning.label"
        @click="sky.turn()"
      >
        <Icon v-if="turning.mark !== 'step'" :name="turning.mark" />
        <svg v-else viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M1.5 1.5v9L7.5 6zM8.75 1.5h2v9h-2z" fill="currentColor" />
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
        @pointerup="lift"
        @pointercancel="down = null"
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
          @pointerdown="pressPin($event, pass)"
          @pointerenter="sky.held.value = pass"
          @pointerleave="sky.held.value = null"
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
