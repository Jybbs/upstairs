import type { Map } from 'maplibre-gl'

import type { Label } from './overlay.ts'
import type { View } from './mercator.ts'

const MOST = 40
const GAP  = 64

const textOf = (properties: Record<string, unknown>): string | null =>
  (properties['name:en'] ?? properties.name ?? null) as string | null

const tierOf = (kind: string, zoom: number): { tier: Label['tier'], order: number } | null => {
  if (kind === 'country' && zoom < 7) return { tier: 'region', order: 0 }
  if (kind === 'state' && zoom >= 4 && zoom < 8) return { tier: 'region', order: 1 }
  if (kind === 'city' && zoom >= 4) return { tier: 'city', order: 2 }
  if (kind === 'town' && zoom >= 7) return { tier: 'city', order: 3 }
  if (kind === 'village' && zoom >= 10) return { tier: 'city', order: 4 }
  return null
}

/**
 * Reads the names in the map tiles on screen, largest places first, keeping those
 * with room around them. The map carries no text of its own so that its names can
 * be set in the page's book serif.
 */
export const namesOn = (map: Map, view: View): Label[] => {
  const zoom = map.getZoom()
  const found = new globalThis.Map<string, Label & { order: number, rank: number }>()
  for (const { properties, geometry } of map.querySourceFeatures('base', { sourceLayer: 'place' })) {
    const name = textOf(properties), tier = tierOf(String(properties.class), zoom)
    if (!name || !tier || geometry.type !== 'Point') continue
    found.set(name, { name, tier: tier.tier, order: tier.order, rank: Number(properties.rank ?? 99),
      longitude: geometry.coordinates[0], latitude: geometry.coordinates[1] })
  }
  for (const { properties, geometry } of map.querySourceFeatures('base', { sourceLayer: 'water_name' })) {
    const name = textOf(properties)
    if (!name || geometry.type !== 'Point' || zoom < 4) continue
    found.set(name, { name, tier: 'water', order: 1, rank: 1, longitude: geometry.coordinates[0], latitude: geometry.coordinates[1] })
  }

  const kept: Label[] = []
  const spots: [number, number][] = []
  for (const label of [...found.values()].sort((a, b) => a.order - b.order || a.rank - b.rank)) {
    const x = view.column(label.longitude), y = view.row(label.latitude)
    if (!view.inside(x, y, 40) || spots.some(([left, top]) => Math.abs(left - x) < GAP * 1.8 && Math.abs(top - y) < GAP / 2.4)) continue
    kept.push(label); spots.push([x, y])
    if (kept.length === MOST) break
  }
  return kept
}

/**
 * The name of the place nearest a spot in the tiles on screen, if one is close.
 */
export const placeNear = (labels: readonly Label[], view: View, longitude: number, latitude: number): string | null => {
  const x = view.column(longitude), y = view.row(latitude)
  const near = labels
    .filter(label => label.tier === 'city')
    .map(label => ({ name: label.name, distance: Math.hypot(view.column(label.longitude) - x, view.row(label.latitude) - y) }))
    .filter(({ distance }) => distance < 28)
    .sort((a, b) => a.distance - b.distance)[0]
  return near?.name ?? null
}
