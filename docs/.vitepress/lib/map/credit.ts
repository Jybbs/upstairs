import type { Map }                  from 'maplibre-gl'
import { computed, ref, shallowRef } from 'vue'

import { CHIP_MARKS, GLYPHS, SOURCES, type Source, type Stroke } from '../site/seals.ts'

/**
 * A line the credit sets as a track: the link `pick` selects among the
 * credits, what it credits, the name over its seal, the credit line, the
 * glyph at its seal's center under `at`, and the source whose seal it takes
 * where its terms require a credit.
 */
interface Entry {
  glyph   : readonly Stroke[]
  label   : string
  name    : string
  pick    : string
  text    : string
  at?     : string
  source? : Source['id']
}

/**
 * A group of the credit, as its heading, the mark its tab carries on a 16 px
 * square, and its entries in order.
 */
interface Group {
  entries : readonly Entry[]
  heading : string
  mark    : readonly Stroke[]
}

/**
 * A track as the credit draws it, with the address the credits give it and
 * the source its seal stands for.
 */
export interface Track extends Omit<Entry, 'source'> {
  href    : string
  source? : Source
}

const CORE = 'M8 4.6a3.4 3.4 0 1 1 0 6.8a3.4 3.4 0 1 1 0-6.8z'

/**
 * The lines the map's credit adds beside each source's own, each linking the
 * section of the Data page that lists its sources.
 */
export const CREDITS = [
  `<a href="${import.meta.env.BASE_URL}data/#credits-st">Orbits from Space-Track</a>`,
  `<a href="${import.meta.env.BASE_URL}data/#credits-tt">Terrain from Mapzen and its sources</a>`
]

/**
 * The groups the credit's tabs switch between, in reading order.
 */
const GROUPS: readonly Group[] = [
  {
    heading : 'Sources',
    mark    : [
      { d: 'M8 1.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13z', kind: 'line' },
      { d: CORE, kind: 'land' },
      { d: CORE, kind: 'line' }
    ],
    entries : [
      {
        glyph  : GLYPHS.track,
        label  : 'Orbits',
        name   : 'Space-Track',
        pick   : '[href$="#credits-st"]',
        source : 'st',
        text   : 'USSPACECOM via Space-Track'
      },
      {
        glyph  : GLYPHS.relief,
        label  : 'Terrain',
        name   : 'Terrain Tiles',
        pick   : '[href$="#credits-tt"]',
        source : 'tt',
        text   : 'Mapzen and its sources'
      },
      {
        glyph  : GLYPHS.map,
        label  : 'Map data',
        name   : 'OpenStreetMap',
        pick   : '[href*="openstreetmap.org"]',
        source : 'osm',
        text   : 'OpenStreetMap contributors'
      }
    ]
  },
  {
    heading : 'Tiles',
    mark    : CHIP_MARKS.tiles,
    entries : [
      {
        at    : 'translate(-24 -24) scale(3)',
        glyph : CHIP_MARKS.tiles,
        label : 'Host',
        name  : 'OpenFreeMap',
        pick  : '[href*="openfreemap.org"]',
        text  : 'OpenFreeMap'
      },
      {
        glyph  : GLYPHS.schema,
        label  : 'Schema',
        name   : 'OpenMapTiles',
        pick   : '[href*="openmaptiles.org"]',
        source : 'omt',
        text   : '© OpenMapTiles'
      }
    ]
  }
]

/**
 * The links among the credits' lines, each line read as the HTML a source
 * writes it in.
 */
const linksOf = (lines: readonly string[]) => {
  const box     = document.createElement('template')
  box.innerHTML = lines.join(' ')
  return [...box.content.querySelectorAll('a')]
}

/**
 * Sorts the links among the credits' lines into the tracks of each group
 * `GROUPS` sets, leaving out a group with no track.
 */
export const groupsOf = (lines: readonly string[]) => {
  const links = linksOf(lines)
  return GROUPS.flatMap(({ entries, heading, mark }) => {
    const tracks = entries.flatMap(({ source, ...entry }): Track[] => links
      .filter(link => link.matches(entry.pick))
      .map(link => ({
        ...entry,
        href   : link.getAttribute('href')!,
        source : SOURCES.find(each => each.id === source)
      })))
    return tracks.length ? [{ heading, mark, tracks }] : []
  })
}

/**
 * The lines `CREDITS` adds, then each source's own credit once, as the map's
 * sources carry them.
 */
const linesOf = (map: Map) => [...new Set([
  ...CREDITS,
  ...Object.keys(map.getStyle()?.sources ?? {}).flatMap(id => map.getSource(id)?.attribution || [])
])]

/**
 * Measures the width a line of a track takes whole, or broken at its longest
 * word, on a copy laid out beside it in the track's own type.
 */
const widthOf = (line: HTMLElement, fit: 'max-content' | 'min-content') => {
  const copy         = line.cloneNode(true) as HTMLElement
  copy.style.cssText = `position:absolute;visibility:hidden;width:${fit};height:auto;overflow:visible;`
                     + `white-space:${fit === 'max-content' ? 'nowrap' : 'normal'}`
  line.parentElement!.append(copy)
  const { width } = copy.getBoundingClientRect()
  copy.remove()
  return width
}

/**
 * Measures the one width every track of `panel` takes, the widest track's with
 * its padding on both sides. A track's width in each mode is:
 *
 * - wide, its seal, the gap, and its widest line whole
 * - tablet, the widest of its name, its license, and its seal beside its
 *   credit line broken at its longest word
 * - phone, the widest of its seal and its lines, the credit line broken at
 *   its longest word
 */
export const pitchOf = (panel: HTMLElement, mode: 'phone' | 'tablet' | 'wide') => {
  const css  = getComputedStyle(panel)
  const px   = (name: string) => Number.parseFloat(css.getPropertyValue(name)) || 0
  const seal = px('--credit-seal')
  const gap  = px('--credit-col')
  const each = [...panel.querySelectorAll('.credit-track')].map(track => {
    const [name, said, license] = [...track.querySelectorAll<HTMLElement>(':scope > span')]
    const whole = [name!, license!].map(line => widthOf(line, 'max-content'))
    if (mode === 'wide') return seal + gap + Math.max(...whole, widthOf(said!, 'max-content'))
    if (mode === 'tablet') return Math.max(...whole, seal + gap + widthOf(said!, 'min-content'))
    return Math.max(seal, ...whole, widthOf(said!, 'min-content'))
  })
  return Math.ceil(Math.max(0, ...each) + px('--credit-pad') * 2)
}

/**
 * The map's credit: the lines it reads, the groups they sort into, and
 * whether it stands open. It stays closed until the reader presses it, then
 * stays as the reader sets it until a drag of the map closes it.
 */
export class Credit {
  readonly lines  = shallowRef<readonly string[]>(CREDITS)
  readonly open   = ref(false)
  readonly groups = computed(() => groupsOf(this.lines.value))

  readonly close = () => { this.open.value = false }

  /**
   * Follows the lines the sources of `map` carry, holding the lines it has
   * where an event of a source leaves them as they were, and closing the
   * credit as the map is dragged.
   */
  follow(map: Map) {
    const read = () => {
      const lines = linesOf(map)
      const held  = this.lines.value
      if (lines.length !== held.length || lines.some((line, index) => line !== held[index])) {
        this.lines.value = lines
      }
    }
    map.on('sourcedata', read)
    map.on('dragstart', this.close)
    read()
  }

  /**
   * Opens or closes the credit as the reader sets it.
   */
  toggle(open = !this.open.value) {
    this.open.value = open
  }
}
