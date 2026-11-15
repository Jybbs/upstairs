import { useEventListener }                  from '@vueuse/core'
import * as tabs                            from '@zag-js/tabs'
import { normalizeProps, useMachine }       from '@zag-js/vue'
import { computed, defineComponent, onMounted, ref, useId } from 'vue'

import * as seals from '../lib/site/seals.ts'
import Seal       from './Seal.tsx'
import Strokes    from './Strokes.tsx'

type Mark = keyof typeof seals.CHIP_MARKS

const chip = (label: string, mark?: Mark) => <li class="credits-chip caps">{mark && markOf(mark)}{label}</li>

const markOf = (name: Mark) => (
  <svg class="credits-mark" viewBox="0 0 16 16" aria-hidden="true">
    <Strokes strokes={seals.CHIP_MARKS[name]} />
  </svg>
)

const openMapTiles = (source: seals.Source) => (
  <>
    <p class="credits-title">{source.name}</p>
    <dl class="credits-rows">
      <dt class="caps">Supplies</dt>
      <dd>The schema the map’s tiles follow, served through OpenFreeMap</dd>
      <dt class="caps">Notice</dt>
      <dd><q>© OpenMapTiles</q></dd>
      <dt class="caps">License</dt>
      <dd>
        <a href="https://creativecommons.org/licenses/by/4.0/">{source.license}</a>,
        § 3(a)(1) sets the notice
        <br />
        <a class="credits-address" href="https://openmaptiles.org/">openmaptiles.org</a>
      </dd>
    </dl>
  </>
)

const openStreetMap = (source: seals.Source) => (
  <>
    <div class="credits-head">
      <p class="credits-title">{source.name}</p>
      <span class="credits-chip credits-held caps">{source.license}</span>
    </div>
    <p class="credits-lede">
      Every <strong>lake</strong>, <strong>coastline</strong>, and <strong>border</strong> on the map is drawn
      from <em>OpenStreetMap</em>’s data, open under a license that requires this credit.
    </p>
    <dl class="credits-rows">
      <dt class="caps">Supplies</dt>
      <dd>
        <ul class="credits-chips">
          {chip('Lakes', 'lakes')}{chip('Coastlines', 'coasts')}{chip('Borders', 'borders')}
        </ul>
      </dd>
      <dt class="caps">Carried by</dt>
      <dd><ul class="credits-chips">{chip('OpenFreeMap', 'tiles')}{chip('OpenMapTiles schema')}</ul></dd>
      <dt class="caps">Notice</dt>
      <dd>
        <blockquote class="credits-quote">
          <p><span class="credits-sign">©</span> OpenStreetMap contributors</p>
          <footer class="caps">Set by ODbL <span class="credits-clause">§ 4.3</span></footer>
        </blockquote>
      </dd>
      <dt class="caps">License</dt>
      <dd>
        <p class="credits-terms">
          The <em>Open Database License</em> <span class="credits-version">1.0</span>, its terms on
        </p>
        <a class="credits-chip credits-link caps" href="https://www.openstreetmap.org/copyright">
          openstreetmap.org/copyright
          {markOf('link')}
        </a>
      </dd>
    </dl>
  </>
)

const terrainTiles = (source: seals.Source) => (
  <>
    <p class="credits-title">{source.name}</p>
    <dl class="credits-rows">
      <dt class="caps">Supplies</dt>
      <dd>The relief under the map, built by Mapzen from the sources below</dd>
      <dt class="caps">License</dt>
      <dd>
        Each provider’s own, one statement apiece
        <br />
        <a class="credits-address" href="https://registry.opendata.aws/terrain-tiles/">
          registry.opendata.aws/terrain-tiles
        </a>
      </dd>
    </dl>
    <ul class="credits-providers">
      {seals.PROVIDERS.map(({ license, notice, region }) => (
        <li>
          <span class="caps">{region} · {license}</span>
          <q>{notice}</q>
        </li>
      ))}
    </ul>
    <p class="credits-free">
      The United States’ 3DEP and the global GMTED2010 and ETOPO1 data are in the public domain, and SRTM
      is in the public domain within the United States, its specification asserting copyright outside it.
    </p>
  </>
)

const RECORDS = {
  omt : openMapTiles,
  osm : openStreetMap,
  tt  : terrainTiles
} satisfies Record<seals.Source['id'], (source: seals.Source) => unknown>

/**
 * Draws the strip of seals as tabs, one per source whose terms require a
 * credit, each opening its source's record beneath, with every record stacked
 * in one cell so choosing a tab moves nothing else on the page. A tab takes
 * the fragment the README's seals link, so arriving on one opens its record.
 */
export default defineComponent(
  () => {
    const id      = useId()
    const chosen  = ref<string>(seals.SOURCES[0].id)
    const anchors = Object.fromEntries(seals.SOURCES.map(source => [source.id, seals.sealAnchorOf(source)]))
    const service = useMachine(tabs.machine, computed(() => ({
      id            : id,
      ids           : {
        content : (value: string) => `${id}-${value}`,
        trigger : (value: string) => anchors[value]!
      },
      onValueChange : ({ value }: tabs.ValueChangeDetails) => { chosen.value = value },
      translations  : { listLabel: 'The sources credited' },
      value         : chosen.value
    })))
    const strip = computed(() => tabs.connect(service, normalizeProps))

    const follow = () => {
      const source = seals.SOURCES.find(source => location.hash === `#${anchors[source.id]}`)
      if (source) chosen.value = source.id
    }

    onMounted(follow)
    useEventListener('hashchange', follow)

    return () => (
      <div class="credits">
        <div class="credits-strip" {...strip.value.getListProps()}>
          {seals.SOURCES.map(source => (
            <button class="credits-tab" {...strip.value.getTriggerProps({ value: source.id })}>
              <Seal source={source} />
              <span class="credits-name caps">{source.name}</span>
            </button>
          ))}
        </div>
        <div class="credits-records">
          {seals.SOURCES.map(source => (
            <div
              {...strip.value.getContentProps({ value: source.id })}
              hidden={false}
              inert={chosen.value !== source.id}
            >
              {RECORDS[source.id](source)}
            </div>
          ))}
        </div>
      </div>
    )
  },
  { name: 'Credits' }
)
