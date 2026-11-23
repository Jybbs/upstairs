import { computed, defineComponent } from 'vue'

import { ageOf } from '../lib/orbit/catalog.ts'
import { sky }   from '../lib/state/sky.ts'
import Shield    from './Shield.tsx'

const ago   = new Intl.RelativeTimeFormat([], { numeric: 'always' })
const dated = new Intl.DateTimeFormat([], {
  day    : 'numeric',
  hour   : 'numeric',
  minute : '2-digit',
  month  : 'short'
})

/**
 * Writes how long ago `days` were as whole minutes under an hour, whole hours
 * under a day, and whole days past it.
 */
const agoOf = (days: number) => {
  const hours = days * 24
  if (hours < 1) return ago.format(-Math.floor(hours * 60), 'minute')
  return hours < 24 ? ago.format(-Math.floor(hours), 'hour') : ago.format(-Math.floor(days), 'day')
}

/**
 * Closes the sheet on the build's shield, the count of active satellites,
 * and when their orbits were fetched and how long ago that was.
 */
export default defineComponent(
  () => {
    const updated = computed(() => {
      const loaded = sky.loaded.value
      if (!loaded) return ''
      const present = sky.start.value + sky.now.value * 1000
      return `${dated.format(new Date(loaded.fetched))}, ${agoOf(ageOf(loaded.fetched, present))}`
    })

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
            <dt class="caps tracking-[0.14em] text-dim">Orbits fetched</dt>
            <dd class="m-0 font-book text-[19px] leading-6 whitespace-nowrap">{updated.value}</dd>
          </div>
        </dl>
      </footer>
    )
  },
  { name: 'Stamp' }
)
