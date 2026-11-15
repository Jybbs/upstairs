import { computed, defineComponent } from 'vue'

import { sky } from '../lib/state/sky.ts'
import Shield  from './Shield.tsx'

const dated = new Intl.DateTimeFormat([], {
  day    : 'numeric',
  hour   : 'numeric',
  minute : '2-digit',
  month  : 'short'
})

/**
 * Closes the sheet on the build's shield, the count of active satellites,
 * and when their orbits were fetched.
 */
export default defineComponent(
  () => {
    const updated = computed(() => sky.loaded.value ? dated.format(new Date(sky.loaded.value.fetched)) : '')

    return () => (
      <footer class="flex shrink-0 items-center gap-5 border-t border-rule px-4 py-[18px]">
        <Shield />
        <dl class="m-0 grid min-w-0 gap-3.5">
          <div class="flex flex-col-reverse gap-0.5">
            <dt class="caps tracking-[0.14em] text-dim">Active</dt>
            <dd class="m-0 font-display text-[34px] leading-9 font-bold tracking-[-0.01em] text-u">
              {sky.loaded.value?.count.toLocaleString()}
            </dd>
          </div>
          <div class="flex flex-col-reverse gap-0.5">
            <dt class="caps tracking-[0.14em] text-dim">Orbits</dt>
            <dd class="m-0 font-book text-[19px] leading-6 whitespace-nowrap">{updated.value}</dd>
          </div>
        </dl>
      </footer>
    )
  },
  { name: 'Stamp' }
)
