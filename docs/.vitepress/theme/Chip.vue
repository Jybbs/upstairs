<script setup lang="ts">
import type { Kind } from '../lib/orbit/kinds.ts'
import Icon          from './Icon.vue'

defineProps<{ on: boolean, kind?: Kind }>()
defineEmits<{ press: [] }>()
</script>

<template>
  <button
    type="button"
    :aria-pressed="on"
    class="caps inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border px-2 transition-colors
           max-sm:h-11"
    :class="on
      ? 'border-ink bg-ink text-panel'
      : 'border-rule bg-lift text-soft hover:border-soft hover:text-ink'"
    @click="$emit('press')"
  >
    <Icon v-if="kind" :name="kind" :style="on ? { color: 'var(--color-panel)' } : undefined" />
    <slot />
  </button>
</template>
