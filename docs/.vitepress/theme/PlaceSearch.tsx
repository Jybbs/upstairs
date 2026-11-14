import { watchDebounced }                               from '@vueuse/core'
import * as combobox                                    from '@zag-js/combobox'
import { normalizeProps, useMachine }                   from '@zag-js/vue'
import { computed, defineComponent, ref, useId, watch } from 'vue'

import type { Pass, Spot } from '../lib/orbit/scan.ts'
import { sky }             from '../lib/state/sky.ts'
import Icon                from './Icon.tsx'
import SatelliteName       from './SatelliteName.tsx'

interface Feature {
  geometry   : { coordinates: [number, number] }
  properties : Record<string, string | undefined>
}

type Found = Spot & { label: string }

/**
 * A result of the search: a satellite's highest pass, or a place found.
 */
type Result = { craft: Pass } | { place: Found }

/**
 * The fewest letters a search reads.
 */
const LEAST  = 3
const SEARCH = 'https://photon.komoot.io/api/'
const SHOWN  = 5
const WAIT   = 350

const valueOf = (result: Result) =>
  'craft' in result ? `craft:${result.craft.key}` : `place:${result.place.label}`

/**
 * Searches the satellites in the window by name and the places Photon finds
 * by name through a combobox, moving to the result chosen.
 */
export default defineComponent(
  () => {
    const found   = ref<Found[]>([])
    const trouble = ref<string | null>(null)
    const words   = ref('')
    const typed   = computed(() => words.value.trim())
    let latest    = 0

    /**
     * The highest pass in the window of each satellite whose name holds the
     * words typed, at most `SHOWN` of them.
     */
    const crafts = computed(() => {
      const name = typed.value.toUpperCase()
      if (name.length < LEAST) return []
      void sky.version.value
      const highest = new Map<number, Pass>()
      for (const pass of sky.tracks.passes) {
        if (!pass.name.includes(name) || (highest.get(pass.id)?.peak ?? -1) >= pass.peak) continue
        highest.set(pass.id, pass)
      }
      return [...highest.values()].slice(0, SHOWN)
    })

    const nearMe = () => navigator.geolocation.getCurrentPosition(
      ({ coords }) => sky.locate({ latitude: coords.latitude, longitude: coords.longitude }),
      () => { trouble.value = 'The browser did not share a location.' }
    )

    const look = async (query: string) => {
      const asked = ++latest
      try {
        const response = await fetch(`${SEARCH}?limit=${SHOWN}&lang=en&q=${encodeURIComponent(query)}`)
        if (!response.ok) throw new Error()
        const { features } = await response.json() as { features: Feature[] }
        if (asked !== latest) return
        found.value = features.map(({ geometry, properties }) => ({
          latitude  : geometry.coordinates[1],
          longitude : geometry.coordinates[0],
          label     : [properties.name, properties.city, properties.state, properties.country]
            .filter((part, index, all) => part && all.indexOf(part) === index)
            .join(', ')
        }))
        trouble.value = features.length ? null : 'No place by that name.'
      } catch {
        trouble.value = 'The place search is not answering.'
      }
    }

    watch(typed, value => {
      if (value.length >= LEAST) return
      latest++
      found.value   = []
      trouble.value = null
    })
    watchDebounced(typed, value => {
      if (value.length >= LEAST) look(value)
    }, { debounce: WAIT })

    const results = computed<Result[]>(() => [
      ...crafts.value.map(craft => ({ craft })),
      ...found.value.map(place => ({ place }))
    ])
    /**
     * Moves to the satellite's pass or the place a result names.
     */
    const pick = (result: Result) => {
      if ('craft' in result) sky.focusOn(result.craft)
      else {
        const { label, latitude, longitude } = result.place
        sky.pick({ latitude, longitude }, label.split(',')[0])
      }
      words.value = ''
    }
    const shown   = computed(() => results.value.length > 0 || trouble.value !== null)
    const id      = useId()
    const service = useMachine(combobox.machine, computed(() => ({
      allowCustomValue  : true,
      collection        : combobox.collection<Result>({ itemToValue: valueOf, items: results.value }),
      id                : id,
      inputValue        : words.value,
      open              : shown.value,
      selectionBehavior : 'clear' as const,
      value             : [],

      onInputValueChange: ({ inputValue }: combobox.InputValueChangeDetails) => {
        words.value = inputValue
      },

      onOpenChange: ({ open, reason }: combobox.OpenChangeDetails) => {
        if (!open && reason === 'escape-key') words.value = ''
      },

      onValueChange: ({ items }: combobox.ValueChangeDetails<Result>) => {
        if (items[0]) pick(items[0])
      }
    })))
    const search = computed(() => combobox.connect(service, normalizeProps))

    return () => (
      <form
        class="relative flex gap-1.5"
        role="search"
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault()
          if (results.value[0]) pick(results.value[0])
        }}
        onKeydown={(event: KeyboardEvent) => { if (event.key === 'Escape') words.value = '' }}
      >
        <label {...search.value.getLabelProps()} class="sr-only">Search for a place or a satellite</label>
        <input
          {...search.value.getInputProps()}
          type="search"
          placeholder="Search for a place or a satellite"
          class="h-9 min-w-0 flex-1 rounded-sm border border-rule bg-lift px-2.5 text-sm outline-none
                 placeholder:text-soft focus:border-ink max-sm:h-11"
        />
        <button
          type="button"
          class="caps h-9 shrink-0 cursor-pointer rounded-sm border border-rule bg-lift px-2.5 text-soft
                 hover:border-soft hover:text-ink max-sm:h-11"
          onClick={nearMe}
        >
          Near me
        </button>
        {shown.value && (
          <ul
            {...search.value.getContentProps()}
            class="absolute inset-x-0 top-full z-20 mt-1 rounded-sm border border-rule bg-lift py-1 text-sm
                   shadow-md"
          >
            {crafts.value.map(craft => (
              <li key={craft.id} role="presentation">
                <button
                  type="button"
                  {...search.value.getItemProps({ item: { craft } })}
                  class="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-base
                         hover:bg-panel data-highlighted:bg-panel max-sm:min-h-11"
                >
                  <Icon name={craft.kind} />
                  <SatelliteName name={craft.name} class="truncate" />
                </button>
              </li>
            ))}
            {trouble.value && !results.value.length && (
              <li role="presentation" class="px-2.5 py-1.5 text-soft">{trouble.value}</li>
            )}
            {found.value.map(place => (
              <li key={place.label} role="presentation">
                <button
                  type="button"
                  {...search.value.getItemProps({ item: { place } })}
                  class="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left hover:bg-panel
                         data-highlighted:bg-panel max-sm:min-h-11"
                >
                  <Icon name="place" class="text-soft" /><span class="truncate">{place.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
    )
  },
  { name: 'PlaceSearch' }
)
