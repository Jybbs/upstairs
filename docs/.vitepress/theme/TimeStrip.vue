<script setup lang="ts">
import { useElementSize, useRafFn } from '@vueuse/core'
import { computed, ref }            from 'vue'

import { boundOf }                  from '../lib/orbit/compass.ts'
import type { Pass }                from '../lib/orbit/scan.ts'
import { columnsOf, pickAt }        from '../lib/site/columns.ts'
import { turnOf }                   from '../lib/site/drag.ts'
import type { IconName }            from '../lib/site/icons.ts'
import { clamp }                    from '../lib/site/motion.ts'
import { kindColor }                from '../lib/site/palette.ts'
import { usePhone }                 from '../lib/site/phone.ts'
import { ridgeOf }                  from '../lib/site/ridges.ts'
import { CLOCK, minuteFormat, sky } from '../lib/state/sky.ts'
import Icon                         from './Icon.vue'

const LABEL_WIDTH = 78
/**
 * The strip's height, the row its ground runs along, the height a pass
 * standing straight overhead climbs to above it, and its inset either side, in
 * pixels.
 */
const STRIP       = { ground: 74, height: 110, inset: 16, overhead: 60 } as const
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
const inner = computed(() => width.value - STRIP.inset * 2)
/**
 * The climb of each pass that rises or sets in the window, in the order the
 * passes peak.
 */
const climbs = computed(() => sky.rows.value.list
  .filter(pass => boundOf(pass) !== 'holding' && !(pass.earlier && pass.later))
  .map(pass => ({ climb: sky.climbOf(pass), pass })))
/**
 * Each climb drawn as a ridge across the strip's width, with its outline, its
 * crest seen and unseen, and its peak.
 */
const ridges = computed(() => climbs.value.map(({ climb, pass }) => ({
  pass : pass,
  peak : [xOf(pass.peakAt), yOf(pass.peak)] as const,
  ...ridgeOf(climb, xOf, yOf)
})))
/**
 * The ridges from the highest to the lowest, so a lower ridge stands in front
 * of a higher one, with the ridge the readout shows raised above them all.
 */
const stacked = computed(() => ridges.value
  .map(ridge => ({ ...ridge, raised: ridge.pass === sky.shown.value }))
  .toSorted((a, b) => Number(a.raised) - Number(b.raised) || b.pass.peak - a.pass.peak))
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
/**
 * The strip cut into columns around the peaks, which a tap on a phone picks
 * from.
 */
const columns = computed(() =>
  columnsOf(ridges.value.map(({ pass, peak }) => ({ item: pass, x: peak[0] })), width.value))
const phone = usePhone()

/**
 * Where a press on a phone's strip went down, and whether it has turned into a
 * drag across the strip or up and down it.
 */
let down: { drag: 'across' | 'along' | null, x: number, y: number } | null = null

/**
 * Raises the ridge `by` places later or earlier than the one raised, or where
 * none is raised the first to peak after the time read or the last before it.
 */
const browse = (by: 1 | -1) => {
  const passes = ridges.value.map(({ pass }) => pass)
  const index  = passes.findIndex(pass => pass === sky.held.value)
  const at     = sky.at.value
  const next   = index >= 0 ? passes[clamp(index + by, 0, passes.length - 1)]
    : by > 0 ? passes.find(pass => pass.peakAt >= at) : passes.findLast(pass => pass.peakAt < at)
  if (next) sky.held.value = next
}

const drag = (event: PointerEvent) => {
  if (!strip.value!.hasPointerCapture(event.pointerId)) return
  if (down && !down.drag) {
    down.drag = turnOf(down.x, down.y, event)
    if (!down.drag) return
    sky.held.value = null
  }
  if (down?.drag !== 'along') sky.seek(secondsAt(event.clientX))
}

/**
 * Lets the raised ridge fall back once the pointer, the finger, or the focus
 * leaves the strip.
 */
const leave = () => {
  down           = null
  sky.held.value = null
}

/**
 * Chooses on a phone the pass a tap lands on, from the column under it.
 */
const lift = (event: PointerEvent) => {
  if (down && !down.drag) {
    const picked = pickAt(columns.value, xAt(event.clientX), sky.pinned.value)
    if (picked) sky.focusOn(picked)
  }
  leave()
}

const nudge = (event: KeyboardEvent) => {
  const held = sky.held.value
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') browse(event.key === 'ArrowUp' ? 1 : -1)
  else if (event.key === 'Enter' && held) sky.focusOn(held)
  else {
    const step = { ArrowLeft: -60, ArrowRight: 60, PageDown: -600, PageUp: 600 }[event.key]
    if (!step) return
    sky.seek(sky.seconds + step)
  }
  event.preventDefault()
}

/**
 * Starts a press on the strip, which on a phone raises the ridge of the
 * column under the finger while it holds still.
 */
const press = (event: PointerEvent) => {
  strip.value!.setPointerCapture(event.pointerId)
  if (!phone.value) return sky.seek(secondsAt(event.clientX))
  down           = { drag: null, x: event.clientX, y: event.clientY }
  sky.held.value = pickAt(columns.value, xAt(event.clientX), null)
}

/**
 * Chooses the pass whose ridge a pointer presses wider than a phone and moves
 * the clock to its peak, leaving a phone's press to the column under it.
 */
const pressRidge = (event: PointerEvent, pass: Pass) => {
  if (phone.value) return
  event.stopPropagation()
  sky.focusOn(pass)
}

const secondsAt = (clientX: number) => (xAt(clientX) - STRIP.inset) / inner.value * sky.span

/**
 * Returns how far in pixels a pointer at `clientX` stands from the strip's
 * left edge.
 */
const xAt = (clientX: number) => clientX - strip.value!.getBoundingClientRect().left

const xOf = (seconds: number) => STRIP.inset + seconds / sky.span * inner.value

const yOf = (elevation: number) => STRIP.ground - elevation / 90 * STRIP.overhead

useRafFn(() => cursor.value?.setAttribute('transform', `translate(${xOf(sky.seconds)} 0)`))
</script>

<template>
  <section class="shrink-0 border-t border-rule bg-panel" aria-label="Time">
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
        :height="STRIP.height"
        role="slider"
        tabindex="0"
        aria-label="Time within the window"
        aria-keyshortcuts="ArrowUp ArrowDown Enter"
        :aria-valuemin="0"
        :aria-valuemax="sky.span"
        :aria-valuenow="Math.round(sky.at.value)"
        :aria-valuetext="`${sky.clockOf(sky.at.value)}, ${sky.dayOf(sky.at.value)}`"
        @pointerdown="press"
        @pointermove="drag"
        @pointerup="lift"
        @pointercancel="leave"
        @keydown="nudge"
        @blur="leave"
      >
        <g
          v-for="{ pass, outline, seen, unseen, peak, raised } in stacked"
          :key="pass.key"
          class="cursor-pointer"
          :style="{ '--ridge': kindColor(pass.kind) }"
          @pointerdown="pressRidge($event, pass)"
          @pointerenter="phone || (sky.held.value = pass)"
          @pointerleave="phone || (sky.held.value = null)"
        >
          <path
            :d="outline"
            :class="raised
              ? 'fill-[color-mix(in_oklab,var(--ridge)_30%,var(--panel))]'
              : 'fill-[color-mix(in_oklab,var(--ridge)_14%,var(--panel))]'"
          />
          <g
            fill="none"
            stroke="var(--ridge)"
            stroke-linecap="round"
            stroke-linejoin="round"
            :stroke-width="raised ? 2.5 : 1.5"
          >
            <path :d="seen" />
            <path :d="unseen" stroke-dasharray="1 3" />
          </g>
          <circle :cx="peak[0]" :cy="peak[1]" r="3.5" stroke-width="2" class="fill-ink stroke-panel" />
        </g>
        <line
          :x1="STRIP.inset"
          :x2="width - STRIP.inset"
          :y1="STRIP.ground"
          :y2="STRIP.ground"
          class="pointer-events-none stroke-dim"
        />
        <g v-for="tick in ticks" :key="tick.seconds" class="pointer-events-none">
          <line
            :x1="tick.x"
            :x2="tick.x"
            :y1="STRIP.ground - 3"
            :y2="STRIP.ground + 3"
            class="stroke-dim"
          />
          <text
            :x="tick.x"
            :y="STRIP.height - 5"
            :text-anchor="tick.anchor"
            class="caps fill-soft"
          >{{ tick.clock }}</text>
        </g>
        <g class="pointer-events-none" :transform="`translate(${xOf(sky.now.value)} 0)`">
          <line :y1="STRIP.ground + 3" :y2="STRIP.ground + 12" class="stroke-ink" stroke-width="1.5" />
          <text :y="STRIP.height - 20" text-anchor="middle" class="caps fill-ink">Now</text>
        </g>
        <g ref="cursor" class="pointer-events-none">
          <line :y1="4" :y2="STRIP.height - 20" class="stroke-u" stroke-width="1.5" />
          <path d="M-5 2 L5 2 L0 9 Z" class="fill-u" />
        </g>
      </svg>
    </div>
  </section>
</template>
