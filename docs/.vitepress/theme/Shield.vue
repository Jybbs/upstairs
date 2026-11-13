<script setup lang="ts">
import { data } from '../lib/site/provenance.data.ts'
import SiteMark from './SiteMark.vue'

/**
 * The shield's outline, its inner rule drawn at `INSET` of it.
 */
const OUTLINE = 'M-76 -86H76V10C76 60 30 84 0 96C-30 84 -76 60 -76 10Z'
const INSET   = 0.92

/**
 * The scale under the version, a tick every 5 units and every fourth one long.
 */
const TICKS = Array.from({ length: 29 }, (_, i) => `M${-70 + i * 5} -60v${i % 4 ? 2.5 : 5}`).join('')

const readings = [
  { href: undefined,                                  label: 'Version', value: data.version, y: -65.5 },
  { href: `${data.repository}/commit/${data.commit}`, label: 'Commit',  value: data.commit,  y: 22 },
  { href: `https://docs.rs/sgp4/${data.sgp4}`,        label: 'sgp4',    value: data.sgp4,    y: 54 }
]
</script>

<template>
  <svg class="shield block flex-none" viewBox="-98 -90 196 190" width="196" height="190">
    <g fill="none" stroke="var(--u)" aria-hidden="true">
      <path :d="OUTLINE" stroke-width="1.5" />
      <path :d="OUTLINE" :transform="`scale(${INSET})`" stroke-width=".8" />
    </g>
    <path d="M-70 -60H70" stroke="var(--rule)" aria-hidden="true" />
    <path :d="TICKS" stroke="var(--dim)" aria-hidden="true" />
    <SiteMark x="-20" y="-46" width="40" height="40" aria-hidden="true" />
    <g fill="var(--u)" aria-hidden="true">
      <path d="M-80 13H-96L-90 23L-96 33H-80Z M80 13H96L90 23L96 33H80Z" fill-opacity=".55" />
      <path d="M-84 8H84V28H-84Z" />
    </g>
    <text
      v-for="{ href, label, value, y } in readings"
      :key="label"
      class="caps"
      :class="{ scroll: label === 'Commit' }"
      text-anchor="middle"
      :y
    >
      <tspan class="label">{{ `${label} ` }}</tspan>
      <a v-if="href" :href><tspan class="value">{{ value }}</tspan></a>
      <tspan v-else class="value">{{ value }}</tspan>
    </text>
  </svg>
</template>

<style scoped>
.label { fill: var(--dim); }
.value { fill: var(--ink); }

a .value { fill: var(--u); }
a:is(:hover, :focus-visible) .value { text-decoration: underline; }

.scroll .label { fill: var(--page); fill-opacity: .82; }
.scroll .value { fill: var(--page); font-weight: 700; }
</style>
