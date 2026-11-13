<script setup lang="ts">
import { watchDebounced }       from '@vueuse/core'
import { computed, ref, watch } from 'vue'

import type { Pass }  from '../lib/orbit/scan.ts'
import { sky }        from '../lib/state/sky.ts'
import Icon           from './Icon.vue'
import SatelliteName  from './SatelliteName.vue'

interface Feature {
  geometry   : { coordinates: [number, number] }
  properties : Record<string, string | undefined>
}

interface Found { label: string, latitude: number, longitude: number }

/**
 * The fewest letters a search reads.
 */
const LEAST   = 3
const SEARCH  = 'https://photon.komoot.io/api/'
const SHOWN   = 5
const WAIT    = 350
const found   = ref<Found[]>([])
const trouble = ref<string | null>(null)
const words   = ref('')
const typed   = computed(() => words.value.trim())
let latest    = 0

/**
 * The highest pass in the window of each satellite whose name holds the words
 * typed, at most `SHOWN` of them.
 */
const crafts = computed(() => {
  const name = typed.value.toUpperCase()
  if (name.length < LEAST) return []
  void sky.version.value
  const highest = new Map<number, Pass>()
  for (const pass of sky.tracks.passes) {
    if (!pass.name.includes(name) || (highest.get(pass.id)?.peak ?? -1) >= pass.peak) continue
    highest.set(pass.id, pass)
  }
  return [...highest.values()].slice(0, SHOWN)
})

const chooseCraft = (pass: Pass) => {
  sky.focusOn(pass)
  words.value = ''
}

const choose = ({ label, latitude, longitude }: Found) => {
  sky.pick({ latitude, longitude }, label.split(',')[0])
  words.value = ''
  found.value = []
}

const nearMe = () => navigator.geolocation.getCurrentPosition(
  ({ coords }) => sky.locate({ latitude: coords.latitude, longitude: coords.longitude }),
  () => { trouble.value = 'The browser did not share a location.' }
)

const look = async (query: string) => {
  const asked = ++latest
  try {
    const response = await fetch(`${SEARCH}?limit=${SHOWN}&lang=en&q=${encodeURIComponent(query)}`)
    if (!response.ok) throw new Error()
    const { features } = await response.json() as { features: Feature[] }
    if (asked !== latest) return
    found.value = features.map(({ geometry, properties }) => ({
      latitude  : geometry.coordinates[1],
      longitude : geometry.coordinates[0],
      label     : [properties.name, properties.city, properties.state, properties.country]
        .filter((part, index, all) => part && all.indexOf(part) === index)
        .join(', ')
    }))
    trouble.value = features.length ? null : 'No place by that name.'
  } catch {
    trouble.value = 'The place search is not answering.'
  }
}

watch(typed, value => {
  if (value.length >= LEAST) return
  latest++
  found.value   = []
  trouble.value = null
})
watchDebounced(typed, value => {
  if (value.length >= LEAST) look(value)
}, { debounce: WAIT })
</script>

<template>
  <form
    class="relative flex gap-1.5"
    role="search"
    @submit.prevent="crafts[0] ? chooseCraft(crafts[0]) : found[0] && choose(found[0])"
    @keydown.esc="words = ''"
  >
    <input
      v-model="words"
      type="search"
      aria-label="Search for a place or a satellite"
      placeholder="Search for a place or a satellite"
      class="h-9 min-w-0 flex-1 rounded-sm border border-rule bg-lift px-2.5 text-sm outline-none
             placeholder:text-soft focus:border-ink max-sm:h-11"
    >
    <button
      type="button"
      class="caps h-9 shrink-0 cursor-pointer rounded-sm border border-rule bg-lift px-2.5 text-soft
             hover:border-soft hover:text-ink max-sm:h-11"
      @click="nearMe"
    >
      Near me
    </button>
    <ul
      v-if="crafts.length || found.length || trouble"
      class="absolute inset-x-0 top-full z-20 mt-1 rounded-sm border border-rule bg-lift py-1 text-sm
             shadow-md"
    >
      <li v-for="pass in crafts" :key="pass.id">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-base
                 hover:bg-panel max-sm:min-h-11"
          @click="chooseCraft(pass)"
        >
          <Icon :name="pass.kind" />
          <SatelliteName :name="pass.name" class="truncate" />
        </button>
      </li>
      <li v-if="trouble && !found.length && !crafts.length" class="px-2.5 py-1.5 text-soft">{{ trouble }}</li>
      <li v-for="item in found" :key="item.label">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left hover:bg-panel
                 max-sm:min-h-11"
          @click="choose(item)"
        >
          <Icon name="place" class="text-soft" /><span class="truncate">{{ item.label }}</span>
        </button>
      </li>
    </ul>
  </form>
</template>
