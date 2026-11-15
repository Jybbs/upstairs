import { describe, expect, it } from 'vitest'

import * as compass           from '../../lib/orbit/compass.ts'
import { kindOf, type Kind } from '../../lib/orbit/kinds.ts'

describe('kindOf', () => {
  it.each<[string, Kind]>([
    ['STARLINK-34010', 'starlink'], ['ISS (ZARYA)', 'crewed'], ['CSS (TIANHE)', 'crewed'], ['CXO', 'science'],
    ['SWOT', 'earth'], ['GOES 19', 'weather'], ['NAVSTAR 51 (USA 166)', 'navigation'],
    ['ONEWEB-0178', 'comms'], ['CALSPHERE 1', 'other']
  ])('reads %s as %s', (name, kind) => expect(kindOf(name)).toBe(kind))
})

describe('compass words', () => {
  it.each([[0, 'N'], [359, 'N'], [45, 'NE'], [180, 'S'], [292.5, 'WNW'], [-45, 'NW']])(
    'names %f as %s',
    (degrees, point) => expect(compass.pointOf(degrees)).toBe(point)
  )
  it.each([[10, 'northbound'], [90, 'northbound'], [170, 'southbound'], [null, 'holding']] as const)(
    'reads a heading of %s as %s',
    (heading, bound) => expect(compass.boundOf({ heading })).toBe(bound)
  )
  it('writes a whole crossing and one that is up throughout', () => {
    expect(compass.crossingOf({ earlier: false, later: false, riseAz: 315, setAz: 135 }))
      .toBe('NW → SE')
    expect(compass.crossingOf({ earlier: true, later: true, riseAz: 0, setAz: 0 }))
      .toBe('UP THROUGHOUT')
    expect(compass.crossingOf({ earlier: true, later: false, riseAz: 180, setAz: 340 }))
      .toBe('ALREADY UP → NNW')
    expect(compass.crossingOf({ earlier: false, later: true, riseAz: 180, setAz: 340 }))
      .toBe('S → STILL UP')
  })
})

describe('bearings and ranges', () => {
  it.each([
    ['north', { latitude: 0, longitude: 0 }, 10, 0, 0],
    ['east along the equator', { latitude: 0, longitude: 0 }, 0, 10, 90],
    ['south', { latitude: 42.36, longitude: -71.06 }, 30, -71.06, 180],
    ['west across the antimeridian', { latitude: 0, longitude: -179 }, 0, 179, 270]
  ])('points %s', (_, spot, latitude, longitude, bearing) =>
    expect(compass.bearingOf(spot, latitude, longitude)).toBeCloseTo(bearing))

  it.each([
    ['its height straight overhead', 90, 410],
    ['farther at 60°', 60, 468.75],
    ['to the horizon at 0°', 0, 2322.14]
  ])('reads the distance to a satellite 410 km up as %s', (_, elevation, kilometers) =>
    expect(compass.slantOf(410, elevation)).toBeCloseTo(kilometers, 1))
})
