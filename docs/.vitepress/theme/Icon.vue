<script setup lang="ts">
import { computed } from 'vue'

import { KINDS, type Kind }            from '../lib/orbit/kinds.ts'
import { GRID, iconOf, type IconName } from '../lib/site/icons.ts'
import { kindColor }                   from '../lib/site/palette.ts'

const { name, size = 16 } = defineProps<{ name: IconName | null, size?: number }>()

/**
 * The color of the mark of a kind of satellite, every other mark taking the
 * color of the text around it.
 */
const tint = computed(() => name && name in KINDS ? kindColor(name as Kind) : undefined)
</script>

<template>
  <svg
    v-if="name"
    class="shrink-0"
    aria-hidden="true"
    :viewBox="`0 0 ${GRID} ${GRID}`"
    :width="size"
    :height="size"
    :style="{ color: tint }"
    :data-icon="name"
  >
    <path :d="iconOf(name, size)" fill="currentColor" />
  </svg>
</template>
