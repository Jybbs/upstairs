<script setup lang="ts">
import { useResizeObserver }               from '@vueuse/core'
import { defineClientComponent }           from 'vitepress'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const SkyMap  = defineClientComponent(() => import('./SkyMap.vue'))
const loadSky = () => import('../lib/state/sky.ts')

/**
 * The space in pixels the numeral keeps from the panel and from the frame's
 * edges.
 */
const CLEAR    = 24
const address  = ref('')
const frame    = ref<HTMLElement>()
const gathered = ref(false)
const panel    = ref<HTMLElement>()

onMounted(() => { address.value = location.host + location.pathname })

/**
 * Gathers the sky into the numeral holding the clock, or lets it go again and
 * returns the clock to the present.
 */
const press = async () => {
  gathered.value = !gathered.value
  if (!gathered.value) return scatter()
  const { sky } = await loadSky()
  sky.seek(sky.seconds)
  gather()
}

/**
 * Gathers the sky into the numeral over the room of the map the panel leaves
 * open.
 */
const gather = async () => {
  const { sky }    = await loadSky()
  const map        = frame.value!.getBoundingClientRect()
  const words      = panel.value!.getBoundingClientRect()
  const side       = words.right - map.left < map.width * 0.55
  const left       = side ? words.right - map.left + CLEAR : CLEAR
  const top        = side ? CLEAR : words.bottom - map.top + CLEAR
  sky.gather.value = { height: map.height - top - CLEAR, left, top, width: map.width - left - CLEAR }
}

/**
 * Lets the numeral go and returns the clock to the present.
 */
const scatter = async () => {
  const { sky }    = await loadSky()
  sky.gather.value = null
  sky.back()
}

useResizeObserver(frame, () => { if (gathered.value) gather() })
onBeforeUnmount(() => { if (gathered.value) scatter() })
</script>

<template>
  <main ref="frame" class="relative h-[calc(100dvh-var(--vp-nav-height))] overflow-hidden">
    <SkyMap />
    <div
      ref="panel"
      class="absolute top-4 left-4 z-10 grid w-95 max-w-[calc(100%-2rem)] justify-items-start gap-2.5
             rounded-sm border border-rule bg-panel/95 px-5 pt-4 pb-3.5 backdrop-blur-sm"
    >
      <p class="caps -order-2 text-soft">Not found</p>
      <h1 class="font-display text-2xl leading-tight">No page at this address</h1>
      <p class="text-lg">
        There is no page at <span class="font-mono text-base break-all">{{ address }}</span>.
      </p>
      <a class="text-lg underline decoration-soft underline-offset-4 hover:decoration-current" href="/">
        Back to the map
      </a>
      <button
        type="button"
        class="-order-1 cursor-pointer font-display text-[76px] leading-[0.9] text-ink hover:text-u
               aria-pressed:text-u max-sm:text-[56px]"
        :aria-pressed="gathered"
        aria-label="Gather the sky into 404"
        @click="press"
      >404</button>
    </div>
  </main>
</template>
