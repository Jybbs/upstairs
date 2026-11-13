<script setup lang="ts">
import { computed } from 'vue'

import { weighedOf } from '../lib/site/names.ts'

const { name } = defineProps<{ name: string }>()

const weighed = computed(() => weighedOf(name))
</script>

<template>
  <span class="font-mono uppercase tabular-nums">
    <span class="font-extrabold">{{ weighed.base }}</span><span class="font-light">{{ weighed.rest }}</span>
  </span>
</template>
