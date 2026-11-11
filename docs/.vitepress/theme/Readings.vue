<script setup lang="ts">
/**
 * The readings under a drawing, each value in a slot sized for the longest
 * value it takes, so a changing value moves nothing.
 */
defineProps<{ readings: { label: string, longest: string, value: string }[] }>()

const widthOf = (longest: string) => `calc(${longest.length}ch + ${(longest.length * 0.1).toFixed(1)}em)`
</script>

<template>
  <dl class="m-0 mt-3 flex flex-wrap gap-x-8 gap-y-3">
    <div v-for="{ label, longest, value } in readings" :key="label">
      <dt class="caps m-0 text-base text-soft">{{ label }}</dt>
      <dd class="caps m-0 text-[22px] text-ink" :style="{ minWidth: widthOf(longest) }">{{ value }}</dd>
    </div>
  </dl>
</template>
