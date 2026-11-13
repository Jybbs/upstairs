<script setup lang="ts">
import { onClickOutside, onKeyStroke, useElementSize } from '@vueuse/core'
import { onBeforeUnmount, ref, watch }                 from 'vue'

import { coordinatesOf } from '../lib/orbit/compass.ts'
import { usePhone }      from '../lib/site/phone.ts'
import { sky }           from '../lib/state/sky.ts'

const phone = usePhone()
const sheet = ref<HTMLElement>()

const { height } = useElementSize(sheet, undefined, { box: 'border-box' })
watch([height, phone], ([covered, small]) => { sky.raised.value = small ? covered : 0 }, { immediate: true })
onBeforeUnmount(() => { sky.raised.value = 0 })

onKeyStroke('Escape', () => sky.shut())
onClickOutside(sheet, () => sky.shut(), { ignore: ['[data-map]'] })
</script>

<template>
  <section
    ref="sheet"
    class="grid gap-3 rounded-t-xl border border-b-0 border-rule bg-panel px-4 pt-2 pb-4 shadow-lift"
    aria-labelledby="chooser-heading"
  >
    <div class="h-1 w-10 justify-self-center rounded-full bg-rule" aria-hidden="true" />
    <p id="chooser-heading" class="caps text-soft">Choose a spot</p>
    <template v-if="sky.aim.value">
      <p class="font-mono text-xl font-extrabold uppercase" aria-live="polite">
        {{ sky.aim.value.place ?? coordinatesOf(sky.aim.value.spot) }}
      </p>
      <p v-if="sky.aim.value.place" class="caps text-soft">{{ coordinatesOf(sky.aim.value.spot) }}</p>
    </template>
    <p class="text-soft">Move the map under the pin.</p>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="caps h-11 basis-full cursor-pointer rounded-full bg-u text-sm! text-page hover:opacity-90"
        @click="sky.land()"
      >Set the spot here</button>
      <button
        type="button"
        class="caps h-11 cursor-pointer rounded-full border border-rule px-4 text-ink hover:border-soft"
        @click="sky.shut()"
      >Cancel</button>
    </div>
  </section>
</template>
