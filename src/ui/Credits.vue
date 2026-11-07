<script setup lang="ts">
import { computed, ref } from 'vue'

import { sky } from '../state/sky.ts'

const dialog = ref<HTMLDialogElement>()
const updated = computed(() => sky.loaded.value
  ? new Date(sky.loaded.value.fetched).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')
</script>

<template>
  <footer class="caps flex shrink-0 items-center justify-between border-t border-rule px-4 py-2 text-soft">
    <span class="truncate">{{ sky.loaded.value?.count.toLocaleString() }} active · Orbits {{ updated }}</span>
    <button type="button" class="ml-3 shrink-0 cursor-pointer uppercase underline" @click="dialog?.showModal()">Credits</button>
  </footer>
  <dialog ref="dialog" class="m-auto max-w-lg rounded-sm border border-rule bg-paper p-6 text-ink" @click.self="dialog?.close()">
    <h2 class="font-display text-2xl">How this works</h2>
    <div class="mt-3 space-y-3 text-sm leading-6">
      <p>Your browser calculates each position with the SGP4 orbit model, using <a class="underline" href="https://github.com/shashwatak/satellite-js">satellite.js</a>. Upstairs stores no locations. Moving the map requests map pieces from the providers below, and typing in the search box sends that text to Photon.</p>
      <p>Orbital data comes from <a class="underline" href="https://celestrak.org/">CelesTrak</a>, which redistributes data from the US Space Force through <a class="underline" href="https://www.space-track.org/">Space-Track</a>. The list covers active satellites only, without debris, spent rockets, or anything left out of the public catalog.</p>
      <p>Positions come from orbits fitted hours or days earlier, so they can be off by kilometers and shift when a satellite maneuvers. Use them for curiosity, never for safety or navigation.</p>
      <p>The map combines terrain from <a class="underline" href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen’s terrain tiles and their sources</a>, map data from <a class="underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> through <a class="underline" href="https://openfreemap.org/">OpenFreeMap</a>, drawing by <a class="underline" href="https://maplibre.org/">MapLibre</a>, and search by <a class="underline" href="https://photon.komoot.io/">Photon</a>.</p>
    </div>
    <button type="button" class="caps mt-4 h-9 cursor-pointer rounded-sm bg-ink px-3 text-lift" @click="dialog?.close()">Close</button>
  </dialog>
</template>
