import type { Map } from 'maplibre-gl'

import { TRACK_STEP }                                    from '../orbit/scan.ts'
import type { Tracks }                                   from '../state/tracks.ts'
import { type Box, type View, crossesBox, grown, meets } from './mercator.ts'
import type { Label }                                    from './overlay.ts'

/**
 * The ring's caption placed beside the ring, at `angle` radians round from
 * the right, inside `box`.
 */
export interface Caption {
  angle : number
  box   : Box
}

/**
 * A name measured for the view: its text as set, its size in pixels with a
 * pixel to spare on each side, and the pixel its place stands at.
 */
export interface Word {
  height : number
  label  : Label
  text   : string
  width  : number
  x      : number
  y      : number
}

/**
 * The selector marking each panel over the map that names stay out of.
 */
export const CLEAR = '[data-label-clear]'
const GAP          = 64
/**
 * The most names the map keeps.
 */
export const MOST  = 40
const PULL         = 14
/**
 * How the names make room on the map:
 *
 * - `angles`: each place round the ring the caption tries, in degrees from
 *   the right, in order
 * - `caption`: how far past the ring the caption's middle stands, and the
 *   least half size of its box
 * - `edge`: how far inside the view's edge a name and the caption keep
 * - `gap`: how far apart two names keep
 * - `nudges`: how far a name may move up or down off its place, as shares of
 *   its height, tried in order
 * - `spot`: how far a name keeps from the spot's marker, each way
 * - `track`: how far a name keeps from the chosen track's middle
 */
export const ROOM = {
  angles  : [-90, -60, -120, -30, -150, 0, 180, 30, 150, 60, 120, 90],
  caption : { half: 7, out: 10 },
  edge    : { caption: 8, name: 6 },
  gap     : 4,
  nudges  : [0, -0.8, 0.8],
  spot    : 10,
  track   : 5
} as const

/**
 * Returns the box of `word` moved `nudge` of its height off its place.
 */
const boxOf = ({ height, width, x, y }: Word, nudge: number): Box => {
  const middle = y + nudge * height
  return { bottom: middle + height / 2, left: x - width / 2, right: x + width / 2, top: middle - height / 2 }
}

/**
 * Whether any segment of `track`, as `trackOf` lays it out, passes through
 * `box`, reading no segment across a gap.
 */
const crossesTrack = (box: Box, track: Float32Array) => {
  for (let index = 0; index + 3 < track.length; index += 2) {
    if (Number.isNaN(track[index] + track[index + 2])) continue
    if (crossesBox(box, track[index], track[index + 1], track[index + 2], track[index + 3])) return true
  }
  return false
}

const textOf = (properties: Record<string, unknown>): string | null =>
  (properties['name:en'] ?? properties.name ?? null) as string | null

const tierOf = (kind: string, zoom: number): { order: number, tier: Label['tier'] } | null => {
  if (kind === 'country' && zoom < 7) return { order: 0, tier: 'region' }
  if (kind === 'state' && zoom >= 4 && zoom < 8) return { order: 1, tier: 'region' }
  if (kind === 'city' && zoom >= 4) return { order: 2, tier: 'city' }
  if (kind === 'town' && zoom >= 7) return { order: 3, tier: 'city' }
  if (kind === 'village' && zoom >= 10) return { order: 4, tier: 'city' }
  return null
}

/**
 * Whether `box` stands at least `edge` pixels inside the view.
 */
const within = (box: Box, edge: number, view: View) =>
  box.left >= edge && box.top >= edge && box.right <= view.width - edge && box.bottom <= view.height - edge

/**
 * Places the ring's caption, `width` pixels long and set along the ring
 * `radius` pixels round the spot at `x`, `y`, at the first of `room.angles`
 * that crosses none of `words` at their places, `track`, and `covered`, or
 * else at the one crossing the fewest, weighing a panel over a track over a
 * name, and keeping inside the view.
 */
export const captionAt = (
  covered : readonly Box[],
  radius  : number,
  track   : Float32Array,
  view    : View,
  width   : number,
  words   : readonly Word[],
  x       : number,
  y       : number,
  room    : typeof ROOM = ROOM
): Caption | null => {
  const names                                    = words.map(word => boxOf(word, 0))
  let best: (Caption & { score: number }) | null = null
  for (const degrees of room.angles) {
    const angle   = degrees * Math.PI / 180
    const middleX = x + Math.cos(angle) * (radius + room.caption.out)
    const middleY = y + Math.sin(angle) * (radius + room.caption.out)
    const half    = Math.max(width / 2 * Math.abs(Math.sin(angle)), room.caption.half)
    const tall    = Math.max(width / 2 * Math.abs(Math.cos(angle)), room.caption.half)
    const box     = { bottom: middleY + tall, left: middleX - half, right: middleX + half, top: middleY - tall }
    if (!within(box, room.edge.caption, view)) continue
    const score = 3 * names.filter(name => meets(name, box)).length
      + (crossesTrack(grown(box, room.track), track) ? 4 : 0)
      + (covered.some(panel => meets(panel, box)) ? 10 : 0)
    if (!best || score < best.score) best = { angle, box, score }
    if (!score) break
  }
  return best && { angle: best.angle, box: best.box }
}

/**
 * Returns the box of each panel over the map that `map`'s stage marks with
 * `CLEAR`, in the map's own pixels, passing over a panel with no size.
 */
export const coveredOver = (map: HTMLElement): Box[] => {
  const frame = map.getBoundingClientRect()
  const stage = map.closest('[data-map]')?.parentElement
  return [...stage?.querySelectorAll(CLEAR) ?? []].flatMap(panel => {
    const { bottom, height, left, right, top, width } = panel.getBoundingClientRect()
    if (!width || !height) return []
    return [{
      bottom : bottom - frame.top,
      left   : left - frame.left,
      right  : right - frame.left,
      top    : top - frame.top
    }]
  })
}

/**
 * Reads the names in the map tiles on screen, largest places first, keeping
 * those with room around them. The map carries no text of its own, and the
 * overlay sets cities and waters in the book serif and regions in the mono.
 */
export const namesOn = (map: Map, view: View): Label[] => {
  const zoom  = map.getZoom()
  const found = new globalThis.Map<string, Label & { order: number, rank: number }>()
  for (const { geometry, properties } of map.querySourceFeatures('base', { sourceLayer: 'place' })) {
    const name = textOf(properties)
    const tier = tierOf(String(properties.class), zoom)
    if (!name || !tier || geometry.type !== 'Point') continue
    found.set(name, {
      latitude  : geometry.coordinates[1],
      longitude : geometry.coordinates[0],
      name      : name,
      order     : tier.order,
      rank      : Number(properties.rank ?? 99),
      tier      : tier.tier
    })
  }
  for (const { geometry, properties } of map.querySourceFeatures('base', { sourceLayer: 'water_name' })) {
    const name = textOf(properties)
    if (!name || geometry.type !== 'Point' || zoom < 4) continue
    found.set(name, {
      latitude  : geometry.coordinates[1],
      longitude : geometry.coordinates[0],
      name      : name,
      order     : 1,
      rank      : 1,
      tier      : 'water'
    })
  }

  const kept: Label[]              = []
  const spots: [number, number][] = []
  for (const label of [...found.values()].sort((a, b) => a.order - b.order || a.rank - b.rank)) {
    const x = view.column(label.longitude)
    const y = view.row(label.latitude)
    if (!view.inside(x, y, 40)) continue
    if (spots.some(([left, top]) => Math.abs(left - x) < GAP * 1.8 && Math.abs(top - y) < GAP / 2.4)) continue
    kept.push(label)
    spots.push([x, y])
    if (kept.length === MOST) break
  }
  return kept
}

/**
 * Returns the town in the tiles on screen nearest a point of the view beside
 * its distance in pixels, if one stands within `PULL` pixels of it.
 */
export const placeNear = (labels: readonly Label[], x: number, y: number, view: View) =>
  labels.reduce<{ distance: number, label: Label } | null>((near, label) => {
    if (label.tier !== 'city') return near
    const distance = Math.hypot(view.column(label.longitude) - x, view.row(label.latitude) - y)
    return distance < (near?.distance ?? PULL) ? { distance, label } : near
  }, null)

/**
 * Keeps each of `words` in order, up to `most`, at the first of `room.nudges`
 * that holds it `room.edge.name` pixels inside the view, clear of `blocked`,
 * `room.track` pixels clear of `track`, and `room.gap` pixels clear of each
 * word kept before it, passing over a word no nudge makes room for.
 */
export const placeWords = (
  blocked : readonly Box[],
  most    : number,
  track   : Float32Array,
  view    : View,
  words   : readonly Word[],
  room    : typeof ROOM = ROOM
): { box: Box, word: Word }[] => {
  const kept: { box: Box, word: Word }[] = []
  for (const word of words) {
    if (kept.length === most) break
    const box = room.nudges.map(nudge => boxOf(word, nudge)).find(box =>
      within(box, room.edge.name, view)
      && !blocked.some(each => meets(each, box))
      && !crossesTrack(grown(box, room.track), track)
      && !kept.some(each => meets(grown(each.box, room.gap), box)))
    if (box) kept.push({ box, word })
  }
  return kept
}

/**
 * Lays out the track of pass `pass` as the pixels of the points its ribbon
 * draws through from its rise to its set, in pairs, leaving a pair of `NaN`
 * where the model had no place and at the first point past the edge of the
 * world.
 */
export const trackOf = (pass: number, tracks: Tracks, view: View): Float32Array => {
  const { riseAt, setAt } = tracks.passes[pass]
  const first             = Math.ceil(riseAt / TRACK_STEP + 1e-6)
  const count             = Math.max(Math.floor(setAt / TRACK_STEP - 1e-6) - first + 1, 0) + 2
  const points            = new Float32Array(2 * count).fill(NaN)
  let lastX               = NaN
  for (let step = 0; step < count; step++) {
    const seconds = step === 0 ? riseAt : step === count - 1 ? setAt : (first + step - 1) * TRACK_STEP
    if (!tracks.at(pass, seconds)) continue
    const x    = view.column(tracks.longitude)
    const jump = Math.abs(x - lastX) > view.world / 2
    lastX      = x
    if (jump) continue
    points[2 * step]     = x
    points[2 * step + 1] = view.row(tracks.latitude)
  }
  return points
}
