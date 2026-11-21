import { watchDebounced }                               from '@vueuse/core'
import * as combobox                                    from '@zag-js/combobox'
import { normalizeProps, useMachine }                   from '@zag-js/vue'
import { computed, defineComponent, ref, useId, watch } from 'vue'

import * as search   from '../lib/state/search.ts'
import { sky }       from '../lib/state/sky.ts'
import Icon          from './Icon.tsx'
import SatelliteName from './SatelliteName.tsx'

/**
 * A result of the search: a satellite beside its next pass, or a place found.
 */
type Result = { craft: search.Match } | { place: search.Place }

/**
 * The fewest letters a search reads.
 */
const LEAST  = 3
const SEARCH = 'https://photon.komoot.io/api/'
const SHOWN  = 5
const WAIT   = 350

/**
 * Reads the places Photon finds for `query`, rejecting where Photon cannot be
 * reached, answers with an error status, or answers with a body that is no
 * feature collection.
 */
const placesFor = async (query: string): Promise<search.Place[]> => {
  const response = await fetch(`${SEARCH}?limit=${SHOWN}&lang=en&q=${encodeURIComponent(query)}`)
  if (!response.ok) throw new Error()
  const { features } = await response.json() as { features: search.Feature[] }
  return features.map(search.placeOf)
}

const valueOf = (result: Result) =>
  'craft' in result ? `craft:${result.craft.satellite.id}` : `place:${result.place.key}`

/**
 * Searches the whole catalog by name and the places Photon finds by name
 * through a combobox, moving to the result chosen.
 */
export default defineComponent(
  () => {
    const found   = ref<search.Place[]>([])
    const trouble = ref<string | null>(null)
    const words   = ref('')
    const typed   = computed(() => words.value.trim())
    let latest    = 0

    /**
     * Seconds into the window of the present's whole minute.
     */
    const minute = computed(() => Math.floor(sky.now.value / 60) * 60)

    /**
     * The satellites whose names hold the words typed, at most `SHOWN` of
     * them.
     */
    const crafts = computed(() => {
      const name = typed.value.toUpperCase()
      if (name.length < LEAST) return []
      void sky.version.value
      return search.matchesOf(SHOWN, name, sky.tracks.passes, minute.value, sky.satellites.value)
    })

    /**
     * Writes when a satellite's next pass rises, that it is up, or when its
     * last pass set, and for a satellite with no pass, that it has none once
     * the scan has finished, that it was not traced where the catalog expired
     * or the trace stopped, and that the scan is still tracing otherwise.
     */
    const noteOf = ({ pass }: search.Match) => {
      if (!pass) {
        if (sky.done.value) return 'No pass this hour'
        return sky.expired.value || sky.untraced.value ? 'Not traced' : 'Still tracing'
      }
      if (pass.riseAt > minute.value) return `Rises ${sky.clockOf(pass.riseAt)}`
      return pass.setAt >= minute.value ? 'Up now' : `Set ${sky.clockOf(pass.setAt)}`
    }

    const nearMe = () => navigator.geolocation.getCurrentPosition(
      ({ coords }) => sky.locate({ latitude: coords.latitude, longitude: coords.longitude }),
      () => { trouble.value = 'The browser did not share a location.' }
    )

    const look = async (query: string) => {
      const asked  = ++latest
      const places = await placesFor(query).catch(() => null)
      if (asked !== latest) return
      found.value   = places ?? []
      trouble.value = places?.length ? null
        : places ? 'No place by that name.' : 'The place search is not answering.'
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
     * Moves to the satellite's next pass or the place a result names.
     */
    const pick = (result: Result) => {
      if ('craft' in result) {
        if (result.craft.pass) sky.focusOn(result.craft.pass)
      } else {
        const { label, latitude, longitude } = result.place
        sky.pick({ latitude, longitude }, label.split(',')[0])
      }
      words.value = ''
    }
    const collection = computed(() => combobox.collection<Result>({
      isItemDisabled : result => 'craft' in result && !result.craft.pass,
      itemToValue    : valueOf,
      items          : results.value
    }))
    const shown   = computed(() => results.value.length > 0 || trouble.value !== null)
    const id      = useId()
    const service = useMachine(combobox.machine, computed(() => ({
      allowCustomValue  : true,
      collection        : collection.value,
      id                : id,
      inputValue        : words.value,
      open              : shown.value,
      positioning       : { gutter: 4 },
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
    const box = computed(() => combobox.connect(service, normalizeProps))

    return () => (
      <form
        {...box.value.getControlProps()}
        class="relative flex gap-1.5"
        role="search"
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault()
          const first = collection.value.find(collection.value.firstValue)
          if (first) pick(first)
        }}
        onKeydown={(event: KeyboardEvent) => { if (event.key === 'Escape') words.value = '' }}
      >
        <label {...box.value.getLabelProps()} class="sr-only">Search for a place or a satellite</label>
        <input
          {...box.value.getInputProps()}
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
          <div {...box.value.getPositionerProps()} class="z-20">
            <ul
              {...box.value.getContentProps()}
              class="max-h-(--available-height) overflow-y-auto rounded-sm border border-rule bg-lift py-1
                     text-sm shadow-md"
            >
              {crafts.value.map(craft => (
                <li key={craft.satellite.id} role="presentation">
                  <button
                    type="button"
                    {...box.value.getItemProps({ item: { craft } })}
                    class="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-base
                           hover:bg-panel data-highlighted:bg-panel max-sm:min-h-11"
                  >
                    <Icon name={craft.satellite.kind} />
                    <SatelliteName name={craft.satellite.name} class="truncate" />{' '}
                    <span class="ml-auto shrink-0 text-soft">{noteOf(craft)}</span>
                  </button>
                </li>
              ))}
              {trouble.value && !results.value.length && (
                <li role="presentation" class="px-2.5 py-1.5 text-soft">{trouble.value}</li>
              )}
              {found.value.map(place => (
                <li key={place.key} role="presentation">
                  <button
                    type="button"
                    {...box.value.getItemProps({ item: { place } })}
                    class="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left
                           hover:bg-panel data-highlighted:bg-panel max-sm:min-h-11"
                  >
                    <Icon name="place" class="text-soft" /><span class="truncate">{place.label}</span>{' '}
                    {place.kind && <span class="ml-auto shrink-0 text-soft">{place.kind}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    )
  },
  { name: 'PlaceSearch' }
)
