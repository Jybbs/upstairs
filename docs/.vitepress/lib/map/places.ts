import type { Map } from 'maplibre-gl'

import type { View }  from './mercator.ts'
import type { Label } from './overlay.ts'

const GAP  = 64
const MOST = 40

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
 * Returns the name of the place nearest a spot in the tiles on screen, if one
 * is close.
 */
export const placeNear = (
  labels    : readonly Label[],
  latitude  : number,
  longitude : number,
  view      : View
): string | null => {
  const x    = view.column(longitude)
  const y    = view.row(latitude)
  const near = labels
    .filter(label => label.tier === 'city')
    .map(label => ({
      distance : Math.hypot(view.column(label.longitude) - x, view.row(label.latitude) - y),
      name     : label.name
    }))
    .filter(({ distance }) => distance < 28)
    .sort((a, b) => a.distance - b.distance)[0]
  return near?.name ?? null
}
