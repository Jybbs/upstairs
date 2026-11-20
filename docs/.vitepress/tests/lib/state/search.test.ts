import { describe, expect, it } from 'vitest'

import * as search from '../../../lib/state/search.ts'
import { passOf }  from '../../common/passes.ts'
import photon      from '../../fixtures/photon.json' with { type: 'json' }

const ISS     = { epoch: 0, id: 25544, kind: 'crewed', name: 'ISS (ZARYA)' } as const
const NOAA    = { epoch: 0, id: 33591, kind: 'weather', name: 'NOAA 19 (SATS)' } as const
const TIANHE  = { epoch: 0, id: 48274, kind: 'crewed', name: 'CSS (TIANHE)' } as const
const UNISSUE = { epoch: 0, id: 60000, kind: 'other', name: 'UNISSUED 1' } as const

describe('the satellites a search matches', () => {
  it.each([
    ['takes the pass still up over one that has set', 400, [0, 300], 300],
    ['takes the earliest of the passes yet to set', 0, [2000, 300], 300],
    ['keeps the pass held over a later one yet to set', 0, [300, 2000], 300],
    ['takes a pass that has set where the satellite has no other', 1000, [300], 300]
  ])('%s', (_, present, rises, next) => {
    const passes = rises.map(riseAt =>
      passOf(ISS.id, { key: `${ISS.id}/${riseAt}`, name: ISS.name, riseAt, setAt: riseAt + 300 }))
    expect(search.matchesOf(5, 'ISS', passes, present, [ISS]).map(({ pass }) => pass?.riseAt)).toEqual([next])
  })

  it('lists the satellites with a pass yet to set first in the order they rise, then those whose pass '
   + 'has set, then the rest in catalog order', () => {
    const passes = [
      passOf(TIANHE.id, { name: TIANHE.name, riseAt: 900, setAt: 1200 }),
      passOf(ISS.id, { name: ISS.name, riseAt: 300, setAt: 600 }),
      passOf(NOAA.id, { name: NOAA.name, riseAt: 0, setAt: 200 })
    ]
    const found = search.matchesOf(5, 'S', passes, 250, [UNISSUE, TIANHE, NOAA, ISS])
    expect(found.map(({ pass, satellite }) => [satellite.id, pass?.riseAt ?? null]))
      .toEqual([[ISS.id, 300], [TIANHE.id, 900], [NOAA.id, 0], [UNISSUE.id, null]])
  })

  it('lists at most the number asked for, those with a pass kept first', () => {
    const passes = [passOf(TIANHE.id, { name: TIANHE.name })]
    expect(search.matchesOf(2, 'S', passes, 0, [ISS, UNISSUE, TIANHE]).map(({ satellite }) => satellite.id))
      .toEqual([TIANHE.id, ISS.id])
  })

  it('lists no satellite whose name does not hold the words', () => {
    expect(search.matchesOf(5, 'NOAA', [passOf(ISS.id, { name: ISS.name })], 0, [ISS])).toEqual([])
  })
})

describe('a place found', () => {
  const [london] = photon.features

  it.each([
    ['reads a place by its OpenStreetMap place value', {}, 'city'],
    ['reads a boundary by its GeocodeJson type',
      { osm_key: 'boundary', osm_value: 'administrative', type: 'district' }, 'district'],
    ['writes an OpenStreetMap value in words', { osm_value: 'isolated_dwelling' }, 'isolated dwelling'],
    ['leaves the kind empty where Photon names none', { osm_key: 'boundary', type: undefined }, '']
  ])('%s', (_, changes, kind) => {
    const feature = { ...london, properties: { ...london.properties, ...changes } }
    expect(search.placeOf(feature).kind).toBe(kind)
  })

  it('keys each place by the OpenStreetMap object it stands for and labels it by its region', () => {
    const properties = { ...london.properties, city: 'London', county: 'Greater London' }
    expect(search.placeOf({ ...london, properties })).toEqual({
      key       : 'R175342',
      kind      : 'city',
      label     : 'London, Greater London, England, United Kingdom',
      latitude  : 51.5074456,
      longitude : -0.1277653
    })
  })
})
