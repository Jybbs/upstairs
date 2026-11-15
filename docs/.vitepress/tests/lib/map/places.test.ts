import type { Map }              from 'maplibre-gl'
import { describe, expect, it } from 'vitest'

import { View }               from '../../lib/map/mercator.ts'
import type { Label }         from '../../lib/map/overlay.ts'
import { namesOn, placeNear } from '../../lib/map/places.ts'

interface Feature {
  geometry   : { coordinates: [number, number], type: string }
  properties : Record<string, unknown>
}

const view = new View()
view.set(1000, 600, 9, 0, 0)

/**
 * Returns a feature of the map's tiles standing `x` and `y` pixels from the
 * view's center, a point unless `type` names another geometry.
 */
const featureAt = (properties: Record<string, unknown>, x = 0, y = 0, type = 'Point'): Feature => {
  const { latitude, longitude } = placeAt(x, y)
  return { geometry: { coordinates: [longitude, latitude], type }, properties }
}

const labelAt = (name: string, x: number, y: number, tier: Label['tier'] = 'city'): Label =>
  ({ ...placeAt(x, y), name, tier })

/**
 * Returns the names `namesOn` reads off a map at `zoom` whose tiles hold
 * `place` and `water_name` features.
 */
const namesAt = (layers: { place?: Feature[], water_name?: Feature[] }, zoom: number) => {
  const map = {
    getZoom             : () => zoom,
    querySourceFeatures : (_: string, { sourceLayer }: { sourceLayer: keyof typeof layers }) =>
      layers[sourceLayer] ?? []
  }
  return namesOn(map as unknown as Map, view)
}

/**
 * Returns the latitude and longitude standing `x` and `y` pixels from the
 * view's center.
 */
const placeAt = (x: number, y: number) =>
  ({ latitude: -y / view.scale(0) / 111.32, longitude: x / view.scale(0) / 111.32 })

describe('the names on the map', () => {
  it.each([
    ['country', 6.9, ['region']],
    ['country', 7, []],
    ['state', 3.9, []],
    ['state', 4, ['region']],
    ['state', 7.9, ['region']],
    ['state', 8, []],
    ['city', 3.9, []],
    ['city', 4, ['city']],
    ['town', 6.9, []],
    ['town', 7, ['city']],
    ['village', 9.9, []],
    ['village', 10, ['city']],
    ['hamlet', 14, []]
  ])('sets a %s at zoom %s in the tiers %j', (kind, zoom, tiers) => {
    const names = namesAt({ place: [featureAt({ class: kind, name: 'Place' })] }, zoom)
    expect(names.map(label => label.tier)).toEqual(tiers)
  })

  it.each([
    [3.9, []],
    [4, ['water']]
  ])('names a water at zoom %s in the tiers %j', (zoom, tiers) => {
    const names = namesAt({ water_name: [featureAt({ name: 'Gulf of Maine' })] }, zoom)
    expect(names.map(label => label.tier)).toEqual(tiers)
  })

  it('reads the English name before the local one, and passes over a place with neither', () => {
    const place = [
      featureAt({ class: 'city', 'name:en': 'Cologne', name: 'Köln' }),
      featureAt({ class: 'city' }, 300, 200)
    ]
    expect(namesAt({ place }, 9).map(label => label.name)).toEqual(['Cologne'])
  })

  it('passes over a place or a water drawn as anything but a point', () => {
    const place      = [featureAt({ class: 'city', name: 'Shire' }, 0, 0, 'Polygon')]
    const water_name = [featureAt({ name: 'Bay' }, 0, 0, 'LineString')]
    expect(namesAt({ place, water_name }, 9)).toEqual([])
  })

  it('names the largest places first, and by rank within a size, an unranked place last', () => {
    const place = [
      featureAt({ class: 'town', name: 'Town', rank: 1 }, -300, -200),
      featureAt({ class: 'city', name: 'Unranked' }, 300, -200),
      featureAt({ class: 'city', name: 'Second', rank: 5 }, -300, 200),
      featureAt({ class: 'city', name: 'First', rank: 2 }, 300, 200),
      featureAt({ class: 'state', name: 'State', rank: 9 })
    ]
    expect(namesAt({ place }, 7).map(label => label.name))
      .toEqual(['State', 'First', 'Second', 'Unranked', 'Town'])
  })

  it.each([
    ['keeps a place 40 px past the edge of the view', 540, ['Edge']],
    ['passes over a place 41 px past the edge of the view', 541, []]
  ])('%s', (_, x, names) => {
    const place = [featureAt({ class: 'city', name: 'Edge' }, x, 0)]
    expect(namesAt({ place }, 9).map(label => label.name)).toEqual(names)
  })

  it.each([
    ['passes over a smaller place 115 px beside a larger one', 115, 0, ['Large']],
    ['keeps a smaller place 116 px beside a larger one', 116, 0, ['Large', 'Small']],
    ['passes over a smaller place 26 px below a larger one', 0, 26, ['Large']],
    ['keeps a smaller place 27 px below a larger one', 0, 27, ['Large', 'Small']]
  ])('%s', (_, x, y, names) => {
    const place = [
      featureAt({ class: 'city', name: 'Large', rank: 1 }),
      featureAt({ class: 'city', name: 'Small', rank: 2 }, x, y)
    ]
    expect(namesAt({ place }, 9).map(label => label.name)).toEqual(names)
  })

  it('names at most 40 places', () => {
    const place = Array.from({ length: 60 }, (_, index) =>
      featureAt({ class: 'city', name: `Place ${index}` }, (index % 6) * 150 - 400,
      Math.floor(index / 6) * 50 - 250))
    expect(namesAt({ place }, 9)).toHaveLength(40)
  })
})

describe('the town near a point', () => {
  it.each([
    ['pulls the pin onto the nearest town within 14 px',
      [labelAt('Far', 12, 0), labelAt('Near', 0, 6)], 'Near'],
    ['leaves the pin where no town stands within 14 px', [labelAt('Far', 15, 0)], null],
    ['passes over a region or a water however near',
      [labelAt('Sea', 2, 0, 'water'), labelAt('Shire', 0, 2, 'region')], null]
  ] as const)('%s', (_, labels, name) =>
    expect(placeNear(labels, 500, 300, view)?.label.name ?? null).toBe(name))
})
