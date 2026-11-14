<script setup lang="ts">
import { KINDS, type Kind } from '../lib/orbit/kinds.ts'
import Icon                 from './Icon.vue'

defineProps<{ kind: Kind }>()
</script>

<template>
  <span
    class="caps inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-sm border border-rule bg-lift px-2
           text-ink"
  >
    <Icon :name="kind" />{{ KINDS[kind].label }}
  </span>
</template>
