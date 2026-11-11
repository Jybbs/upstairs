<script setup lang="ts">
import { ref, watch } from 'vue'

import { sky } from '../lib/state/sky.ts'

interface Feature {
  geometry   : { coordinates: [number, number] }
  properties : Record<string, string | undefined>
}

interface Found { label: string, latitude: number, longitude: number }

const SEARCH  = 'https://photon.komoot.io/api/'
const WAIT    = 350
const found   = ref<Found[]>([])
const trouble = ref<string | null>(null)
const words   = ref('')
let latest    = 0
let timer     = 0

const choose = ({ label, latitude, longitude }: Found) => {
  sky.pick({ latitude, longitude }, label.split(',')[0])
  words.value = ''
  found.value = []
}

const locate = () => navigator.geolocation.getCurrentPosition(
  ({ coords }) => sky.pick({ latitude: coords.latitude, longitude: coords.longitude }, 'your location'),
  () => { trouble.value = 'The browser did not share a location.' }
)

const look = async (query: string) => {
  const asked = ++latest
  try {
    const response = await fetch(`${SEARCH}?limit=5&lang=en&q=${encodeURIComponent(query)}`)
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

watch(words, value => {
  clearTimeout(timer)
  if (value.trim().length < 3) {
    found.value   = []
    trouble.value = null
    return
  }
  timer = window.setTimeout(() => look(value.trim()), WAIT)
})
</script>

<template>
  <form
    class="relative flex gap-1.5"
    role="search"
    @submit.prevent="found[0] && choose(found[0])"
    @keydown.esc="words = ''"
  >
    <input
      v-model="words"
      type="search"
      aria-label="Search for a place"
      placeholder="Search for a place"
      class="h-9 min-w-0 flex-1 rounded-sm border border-rule bg-lift px-2.5 text-sm outline-none placeholder:text-soft focus:border-ink"
    >
    <button
      type="button"
      class="caps h-9 shrink-0 cursor-pointer rounded-sm border border-rule bg-lift px-2.5 text-soft hover:border-soft hover:text-ink"
      @click="locate"
    >
      Near me
    </button>
    <ul
      v-if="found.length || trouble"
      class="absolute inset-x-0 top-full z-20 mt-1 rounded-sm border border-rule bg-lift py-1 text-sm shadow-md"
    >
      <li v-if="trouble && !found.length" class="px-2.5 py-1.5 text-soft">{{ trouble }}</li>
      <li v-for="item in found" :key="item.label">
        <button
          type="button"
          class="w-full cursor-pointer truncate px-2.5 py-1.5 text-left hover:bg-panel"
          @click="choose(item)"
        >{{ item.label }}</button>
      </li>
    </ul>
  </form>
</template>
