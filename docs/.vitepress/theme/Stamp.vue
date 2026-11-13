<script setup lang="ts">
import { computed } from 'vue'

import { sky } from '../lib/state/sky.ts'
import Shield  from './Shield.vue'

const dated = new Intl.DateTimeFormat([], {
  day    : 'numeric',
  hour   : 'numeric',
  minute : '2-digit',
  month  : 'short'
})
const updated = computed(() => sky.loaded.value ? dated.format(new Date(sky.loaded.value.fetched)) : '')
</script>

<template>
  <footer class="flex shrink-0 items-center gap-5 border-t border-rule px-4 py-[18px]">
    <Shield />
    <dl class="m-0 grid min-w-0 gap-3.5">
      <div class="flex flex-col-reverse gap-0.5">
        <dt class="caps tracking-[0.14em] text-dim">Active</dt>
        <dd class="m-0 font-display text-[34px] leading-9 font-bold tracking-[-0.01em] text-u">
          {{ sky.loaded.value?.count.toLocaleString() }}
        </dd>
      </div>
      <div class="flex flex-col-reverse gap-0.5">
        <dt class="caps tracking-[0.14em] text-dim">Orbits</dt>
        <dd class="m-0 font-book text-[19px] leading-6 whitespace-nowrap">{{ updated }}</dd>
      </div>
    </dl>
  </footer>
</template>
