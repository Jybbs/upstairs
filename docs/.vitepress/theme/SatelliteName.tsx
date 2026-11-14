import { computed, defineComponent } from 'vue'

import { weighedOf } from '../lib/site/names.ts'

/**
 * Sets a satellite's name with its base heavy and the rest light.
 */
export default defineComponent(
  (props: { name: string }) => {
    const weighed = computed(() => weighedOf(props.name))

    return () => (
      <span class="font-mono uppercase tabular-nums">
        <span class="font-extrabold">{weighed.value.base}</span>
        <span class="font-light">{weighed.value.rest}</span>
      </span>
    )
  },
  { name: 'SatelliteName', props: ['name'] }
)
