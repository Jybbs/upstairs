<script setup lang="ts">
import MARK from '../lib/site/mark.json' with { type: 'json' }
</script>

<template>
  <svg class="site-mark" :viewBox="MARK.s32.box" width="32" height="32" role="img" aria-label="Upstairs">
    <path :d="MARK.capital" fill-opacity=".3" />
    <path :d="MARK.s32.d" fill-rule="evenodd" />
  </svg>
</template>

<style scoped>
.site-mark {
  flex: none;
  fill: var(--u);
}
</style>
