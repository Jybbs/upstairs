<script setup lang="ts">
import { computed } from 'vue'

import { sky } from '../lib/state/sky.ts'

const dated = new Intl.DateTimeFormat([], {
  day    : 'numeric',
  hour   : 'numeric',
  minute : '2-digit',
  month  : 'short'
})
const updated = computed(() => sky.loaded.value ? dated.format(new Date(sky.loaded.value.fetched)) : '')
</script>

<template>
  <footer class="caps flex shrink-0 items-center border-t border-rule px-4 py-2 text-soft">
    <span class="truncate">{{ sky.loaded.value?.count.toLocaleString() }} active · Orbits {{ updated }}</span>
  </footer>
</template>
