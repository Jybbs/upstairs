<script setup lang="ts">
import { onClickOutside, useElementSize } from '@vueuse/core'
import { computed, ref, watchEffect }     from 'vue'

import { KINDS, kindOrder, type Kind } from '../lib/orbit/kinds.ts'
import { kindColor }                   from '../lib/site/palette.ts'
import { tallyOf }                     from '../lib/site/tally.ts'
import { sky }                         from '../lib/state/sky.ts'

const bar      = ref<HTMLElement>()
const focused  = ref<Kind | null>(null)
const held     = ref<Kind | null>(null)
const keyed    = ref(false)
const released = ref(false)
const rested   = ref<Kind | null>(null)
const shown    = computed(() => kindOrder
  .map((kind, index) => ({ count: sky.reading.value.kinds[index], kind }))
  .filter(({ count, kind }) => count > 0 || (keyed.value && focused.value === kind)))
const { width } = useElementSize(bar, { height: 16, width: 320 })
const fitted    = computed(() => tallyOf(shown.value.map(({ count }) => count), width.value))

/**
 * Names a kind once the keyboard reaches its group, leaving a pointer's press
 * to `press`.
 */
const enter = (event: FocusEvent, kind: Kind) => {
  focused.value  = kind
  keyed.value    = (event.target as HTMLElement).matches(':focus-visible')
  released.value = !keyed.value
}

const leave = () => {
  focused.value  = null
  keyed.value    = false
  released.value = false
}

const letGo = () => {
  held.value     = null
  released.value = true
}

const press = (kind: Kind) => { held.value = held.value === kind ? null : kind }

const rest = (event: PointerEvent, kind: Kind | null) => {
  if (event.pointerType === 'mouse') rested.value = kind
}

onClickOutside(bar, () => { held.value = null })
watchEffect(() => {
  const named     = rested.value ?? held.value ?? (released.value ? null : focused.value)
  sky.named.value = shown.value.some(({ kind }) => kind === named) ? named : null
})
</script>

<template>
  <div
    ref="bar"
    class="flex h-4 items-stretch"
    role="group"
    aria-label="Kinds on this map"
    :style="{ '--pitch': `${fitted.pitch}px`, '--tick': `${fitted.tick}px` }"
    @keydown.esc="letGo"
  >
    <button
      v-for="({ count, kind }, index) in shown"
      :key="kind"
      type="button"
      class="relative flex-none cursor-pointer rounded-[1px]
             bg-[repeating-linear-gradient(90deg,var(--ink-of)_0_var(--tick),transparent_var(--tick)_var(--pitch))]
             transition-[width,opacity] duration-600 ease-[cubic-bezier(.32,.72,0,1)]
             before:absolute before:-inset-y-3.5 before:right-(--reach-right) before:left-(--reach-left)
             before:content-[''] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4
             focus-visible:outline-u motion-reduce:transition-none"
      :class="{ 'opacity-25': sky.named.value && sky.named.value !== kind }"
      :style="{
        '--ink-of'      : kindColor(kind),
        '--reach-left'  : `${-fitted.groups[index].left}px`,
        '--reach-right' : `${-fitted.groups[index].right}px`,
        marginRight     : `${fitted.groups[index].gap}px`,
        width           : `${fitted.groups[index].width}px`
      }"
      :aria-pressed="held === kind"
      :aria-label="`${KINDS[kind].label}, ${count.toLocaleString()} on this map`"
      @blur="leave"
      @click="press(kind)"
      @focus="enter($event, kind)"
      @pointerenter="rest($event, kind)"
      @pointerleave="rest($event, null)"
    />
  </div>
</template>
