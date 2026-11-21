import type { FilterSpecification, Map } from 'maplibre-gl'
import { describe, expect, it }         from 'vitest'

import { type Box, View }          from '../../../lib/map/mercator.ts'
import type { Label }              from '../../../lib/map/overlay.ts'
import * as places                 from '../../../lib/map/places.ts'
import { TRACK_STEP, TRACK_WIDTH } from '../../../lib/orbit/scan.ts'
import { Tracks }                  from '../../../lib/state/tracks.ts'
import { passOf }                  from '../../common/passes.ts'

interface Feature {
  geometry   : { coordinates: [number, number], type: string }
  properties : Record<string, unknown>
}

/**
 * The source layer each read of the tiles asked for, beside the classes its
 * filter keeps, or null where it set none.
 */
const asked: [string, string[] | null][] = []
const view                              = new View()
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
 * `place` and `water_name` features, keeping the features of the classes a
 * filter of the form `['in', ['get', 'class'], ['literal', classes]]` lists and
 * recording each read in `asked`.
 */
const namesAt = (layers: { place?: Feature[], water_name?: Feature[] }, zoom: number) => {
  asked.length = 0
  const map    = {
    getZoom             : () => zoom,
    querySourceFeatures : (
      _                       : string,
      { filter, sourceLayer } : { filter?: FilterSpecification, sourceLayer: keyof typeof layers }
    ) => {
      const classes = filter ? (filter as [string, unknown, [string, string[]]])[2][1] : null
      asked.push([sourceLayer, classes])
      return (layers[sourceLayer] ?? [])
        .filter(({ properties }) => !classes || classes.includes(String(properties.class)))
    }
  }
  return places.namesOn(map as unknown as Map, view)
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
    [2.3, [['place', ['country']]]],
    [4, [['place', ['city', 'country', 'state']], ['water_name', null]]],
    [9, [['place', ['city', 'town']], ['water_name', null]]],
    [12, [['place', ['city', 'town', 'village']], ['water_name', null]]]
  ])('reads off the tiles at zoom %s only the classes it names, and waters from zoom 4', (zoom, reads) => {
    namesAt({}, zoom)
    expect(asked).toEqual(reads)
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
    expect(places.placeNear(labels, 500, 300, view)?.label.name ?? null).toBe(name))
})

/**
 * Returns a word 40 pixels wide and 10 tall standing at `x`, `y`.
 */
const wordAt = (name: string, x: number, y: number): places.Word =>
  ({ height: 10, label: labelAt(name, x - 500, y - 300), text: name, width: 40, x, y })

/**
 * Returns a panel running across the view from `top` to `bottom`.
 */
const bandOf = (top: number, bottom: number): Box => ({ bottom, left: 0, right: 1000, top })

/**
 * Returns a track running straight between the given points, in pairs.
 */
const lineOf = (...points: number[]) => Float32Array.from(points)

const keptOf = (words: places.Word[], blocked: Box[] = [], track = lineOf(), most = Infinity) =>
  new places.Layout(track, view, words).place(blocked, most)
    .map(({ box, word }) => [word.text, (box.top + box.bottom) / 2])

describe('the names placed on the map', () => {
  it.each([
    ['keeps a word 6 px inside the edge', 26, [['Edge', 300]]],
    ['passes over a word nearer the edge than 6 px', 25, []]
  ])('%s', (_, x, kept) => expect(keptOf([wordAt('Edge', x, 300)])).toEqual(kept))

  it.each([
    ['keeps a word at its place where nothing covers it', [], [['Clear', 300]]],
    ['moves a word up off a panel over its lower half', [bandOf(302, 320)], [['Clear', 292]]],
    ['moves a word down off a panel over its upper half', [bandOf(280, 298)], [['Clear', 308]]],
    ['passes over a word a panel covers whole', [bandOf(280, 320)], []]
  ])('%s', (_, blocked, kept) => expect(keptOf([wordAt('Clear', 500, 300)], blocked)).toEqual(kept))

  it.each([
    ['passes over a word the track crosses', lineOf(500, 0, 500, 600), []],
    ['keeps a word 6 px beside the track', lineOf(526, 0, 526, 600), [['Near', 300]]],
    ['passes over a word 5 px beside the track', lineOf(525, 0, 525, 600), []],
    ['reads no segment across a gap in the track', lineOf(500, 0, NaN, NaN, 500, 600), [['Near', 300]]]
  ])('%s', (_, track, kept) => expect(keptOf([wordAt('Near', 500, 300)], [], track)).toEqual(kept))

  it.each([
    ['keeps a word 4 px below another', 314, [['First', 300], ['Second', 314]]],
    ['moves a word nearer than that below the first', 312, [['First', 300], ['Second', 320]]]
  ])('%s', (_, y, kept) =>
    expect(keptOf([wordAt('First', 500, 300), wordAt('Second', 500, y)])).toEqual(kept))

  it.each([
    ['passes over a word the ring’s line crosses', 600, 300, []],
    ['keeps a word 6 px outside the ring’s line', 626, 300, [['Ring', 300]]],
    ['moves a word 5 px outside the ring’s line up off it', 625, 300, [['Ring', 292]]],
    ['keeps a word inside the ring', 500, 300, [['Ring', 300]]],
    ['passes over a word 3 px inside the ring’s line', 577, 300, []],
    ['moves a word down off the ring’s line into the ring', 500, 205, [['Ring', 213]]]
  ])('%s', (_, x, y, kept) => {
    const ring = new places.Layout(lineOf(), view, [wordAt('Ring', x, y)], { radius: 100, x: 500, y: 300 })
    expect(ring.place([], Infinity).map(({ box, word }) => [word.text, (box.top + box.bottom) / 2]))
      .toEqual(kept)
  })

  it('keeps no more words than it is given room for', () => {
    const words = ['One', 'Two', 'Three'].map((name, index) => wordAt(name, 200, 100 * (index + 1)))
    expect(keptOf(words, [], lineOf(), 2)).toEqual([['One', 100], ['Two', 200]])
  })
})

describe('the ring’s caption', () => {
  const at = (covered: Box[] = [], words: places.Word[] = [], track = lineOf()) =>
    new places.Layout(track, view, words, { radius: 100, x: 500, y: 300 }).caption(covered, 80)?.angle ?? null

  it('stands above the ring where nothing crosses it', () => expect(at()).toBeCloseTo(-Math.PI / 2))
  it('moves round the ring off a name above it', () =>
    expect(at([], [wordAt('Above', 500, 190)])).toBeCloseTo(-Math.PI / 3))
  it('moves round the ring off a track above it', () =>
    expect(at([], [], lineOf(500, 0, 500, 250))).toBeCloseTo(-Math.PI / 3))
  it('takes the place crossing the fewest where every place crosses something', () => {
    const covered = [bandOf(0, 600)]
    expect(at(covered, [wordAt('Above', 500, 190)])).toBeCloseTo(-Math.PI / 3)
  })
  it.each([
    ['finds no place where the ring fills the view', { radius: 700, x: 500, y: 300 }],
    ['finds no place with no ring', null]
  ])('%s', (_, ring) => expect(new places.Layout(lineOf(), view, [], ring).caption([], 80)).toBeNull())
})

describe('the chosen track', () => {
  it('lays out a point at its rise, at each step of the samples, and at its set', () => {
    const tracks = new Tracks()
    const track  = new Float32Array(3 * TRACK_WIDTH)
    for (let sample = 0; sample < 3; sample++) track.set([0, sample * 0.1, 45], sample * TRACK_WIDTH)
    tracks.add([passOf(1, { riseAt: 10, setAt: 50 })], track, Uint32Array.of(0), 3)
    const points = Array.from(places.trackOf(0, tracks, view))
    expect(points.filter((_, index) => index % 2 === 0)).toEqual([
      expect.closeTo(view.column(0.1 * 10 / TRACK_STEP), 1),
      expect.closeTo(view.column(0.1), 1),
      expect.closeTo(view.column(0.1 * 50 / TRACK_STEP), 1)
    ])
  })
  it('leaves a gap where the model had no place', () => {
    const tracks = new Tracks()
    const track  = Float32Array.of(0, 0, 45, 0, 0.1, 45, 0, 0.2, 45, NaN, NaN, NaN)
    tracks.add([passOf(1, { riseAt: 0, setAt: 90 })], track, Uint32Array.of(0), 4)
    expect(Array.from(places.trackOf(0, tracks, view)).map(Number.isNaN))
      .toEqual([false, false, false, false, true, true, true, true])
  })
  it('leaves a gap at the first point past the edge of the world', () => {
    const tracks = new Tracks()
    const track  = Float32Array.of(0, 179.9, 45, 0, -179.9, 45, 0, -179.8, 45)
    tracks.add([passOf(1, { riseAt: 0, setAt: 60 })], track, Uint32Array.of(0), 3)
    expect(Array.from(places.trackOf(0, tracks, view)).map(Number.isNaN))
      .toEqual([false, false, true, true, false, false])
  })
})

describe('the panels over the map', () => {
  it('reads each marked panel in the map’s own pixels, passing over one with no size', () => {
    const rect  = (left: number, top: number, width: number, height: number) =>
      ({ bottom: top + height, height, left, right: left + width, top, width })
    const panel = (box: ReturnType<typeof rect>) => ({ getBoundingClientRect: () => box })
    const stage = { querySelectorAll: (selector: string) => selector === places.CLEAR
      ? [panel(rect(20, 80, 100, 50)), panel(rect(0, 0, 0, 0))]
      : [] }
    const map   = {
      closest               : () => ({ parentElement: stage }),
      getBoundingClientRect : () => rect(10, 64, 1000, 600)
    }
    expect(places.coveredOver(map as unknown as HTMLElement))
      .toEqual([{ bottom: 66, left: 10, right: 110, top: 16 }])
  })
  it('reads no panel where the map stands on no stage', () => {
    const map = { closest: () => null, getBoundingClientRect: () => ({ left: 0, top: 0 }) }
    expect(places.coveredOver(map as unknown as HTMLElement)).toEqual([])
  })
})
