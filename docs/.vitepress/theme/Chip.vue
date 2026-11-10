<script setup lang="ts">
defineProps<{ on: boolean, color?: string }>()
defineEmits<{ press: [] }>()
</script>

<template>
  <button
    type="button"
    :aria-pressed="on"
    class="caps inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border px-2 transition-colors"
    :class="on ? 'border-ink bg-ink text-lift' : 'border-rule bg-lift text-soft hover:border-soft hover:text-ink'"
    @click="$emit('press')"
  >
    <span v-if="color" class="size-2 rounded-full" :style="{ background: color, outline: on ? '1px solid var(--color-lift)' : 'none' }" />
    <slot />
  </button>
</template>
