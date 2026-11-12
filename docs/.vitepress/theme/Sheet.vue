<script setup lang="ts">
import { useElementSize }                        from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { turnOf }   from '../lib/site/drag.ts'
import { clamp }    from '../lib/site/motion.ts'
import { sky }      from '../lib/state/sky.ts'
import Filters      from './Filters.vue'
import PassList     from './PassList.vue'
import PassReadout  from './PassReadout.vue'
import Readout      from './Readout.vue'
import TimeStrip    from './TimeStrip.vue'

/**
 * How many milliseconds of a throw's speed carry the sheet's aim on past
 * where the drag lets go, the sheet landing on the stop nearest it.
 */
const THROW  = 180
const detail = ref<HTMLElement>()
const peek   = ref<HTMLElement>()
const sheet  = ref<HTMLElement>()
/**
 * The stop the sheet rests at: peek holding the count, the time, and the
 * strip, half adding the pinned pass, and full adding the hour's list.
 */
const stop   = ref<0 | 1 | 2>(0)
const shown  = ref(0)
const moving = ref(false)

const { height: peekHeight }   = useElementSize(peek, undefined, { box: 'border-box' })
const { height: detailHeight } = useElementSize(detail, undefined, { box: 'border-box' })
const { height: sheetHeight }  = useElementSize(sheet, undefined, { box: 'border-box' })
const stops = computed(() => [
  peekHeight.value,
  peekHeight.value + (sky.shown.value ? detailHeight.value : 0),
  sheetHeight.value
])

/**
 * Where a drag of the sheet went down, the height shown then, and its speed in
 * pixels per millisecond, positive downward.
 */
let grabbed: { at: number, from: number, last: number, speed: number, y: number } | null = null
let pressed: { pointer: number, x: number, y: number } | null = null
let dragged = false

/**
 * Rests the sheet at stop `to`, at peek once no pass is pinned in place of
 * half, letting the pinned pass go at peek.
 */
const rest = (to: 0 | 1 | 2) => {
  stop.value = to === 1 && !sky.shown.value ? 0 : to
  if (stop.value === 0) sky.release()
}

/**
 * Steps the sheet to its next stop up, or back down from full to half while a
 * pass is shown and to peek otherwise.
 */
const cycle = () => rest(stop.value === 2 ? 1 : stop.value === 0 && sky.shown.value ? 1 : 2)

const press = (event: PointerEvent) => {
  dragged = false
  if ((event.target as Element).closest('input, a, .overflow-y-auto')) return
  pressed = { pointer: event.pointerId, x: event.clientX, y: event.clientY }
}

/**
 * Moves the sheet with a drag up or down, once the press has turned up or down
 * rather than across.
 */
const move = (event: PointerEvent) => {
  if (pressed && !grabbed) {
    const turn = turnOf(pressed.x, pressed.y, event)
    if (!turn) return
    if (turn === 'across') {
      pressed = null
      return
    }
    ;(event.currentTarget as Element).setPointerCapture(pressed.pointer)
    grabbed      = { at: performance.now(), from: shown.value, last: event.clientY, speed: 0, y: pressed.y }
    dragged      = true
    moving.value = true
  }
  if (!grabbed) return
  const now     = performance.now()
  grabbed.speed = grabbed.speed / 2 + (event.clientY - grabbed.last) / Math.max(now - grabbed.at, 1) / 2
  grabbed.at    = now
  grabbed.last  = event.clientY
  shown.value   = clamp(grabbed.from - (event.clientY - grabbed.y), stops.value[0], stops.value[2])
}

/**
 * Lands a drag on the stop nearest where it is thrown toward.
 */
const release = () => {
  pressed = null
  if (!grabbed) return
  const aim  = shown.value - grabbed.speed * THROW
  const away = (at: 0 | 1 | 2) => Math.abs(stops.value[at] - aim)
  const near = ([0, 1, 2] as const).reduce((best, at) => away(at) < away(best) ? at : best)
  grabbed      = null
  moving.value = false
  shown.value  = stops.value[near]
  rest(near)
}

watch(sky.pinned, pinned => { if (pinned) rest(1); else if (stop.value === 1) rest(0) })
watch([stop, stops], () => {
  if (grabbed) return
  shown.value       = stops.value[stop.value]
  sky.covered.value = stops.value[Math.min(stop.value, 1)]
}, { immediate: true })
onBeforeUnmount(() => { sky.covered.value = 0 })
</script>

<template>
  <section
    ref="sheet"
    class="absolute inset-x-0 bottom-0 z-20 flex h-[calc(100%-8px)] flex-col rounded-t-2xl border-t
           border-rule bg-panel shadow-lift transition-transform duration-500 ease-[cubic-bezier(.32,.72,0,1)]
           motion-reduce:transition-none"
    :class="{ 'transition-none!': moving }"
    :style="{ transform: `translateY(${sheetHeight - shown}px)` }"
    aria-label="The hour and the pinned pass"
    @pointerdown="press"
    @pointermove="move"
    @pointerup="release"
    @pointercancel="release"
  >
    <div ref="peek" class="shrink-0">
      <button
        type="button"
        class="relative block h-11 w-full cursor-grab touch-none"
        :aria-label="['Raise the sheet', 'Raise the sheet to the hour’s list', 'Lower the sheet'][stop]"
        @click="dragged || cycle()"
      >
        <span class="absolute top-2.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-soft" />
      </button>
      <Readout folded class="touch-none" />
      <TimeStrip />
    </div>
    <div ref="detail" class="shrink-0 border-t border-rule" :inert="stop < 1">
      <div v-if="sky.shown.value" class="flex flex-col gap-3 p-4">
        <PassReadout :key="sky.shown.value.key" :pass="sky.shown.value" />
        <p class="flex justify-between gap-2">
          <button type="button" class="caps h-11 cursor-pointer px-2 text-ink" @click="sky.step(-1)">
            Previous
          </button>
          <button type="button" class="caps h-11 cursor-pointer px-2 text-ink" @click="sky.step(1)">
            Next
          </button>
        </p>
      </div>
    </div>
    <div
      class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-t border-rule"
      :inert="stop < 2"
    >
      <Filters />
      <PassList />
    </div>
  </section>
</template>
