import { describe, expect, it } from 'vitest'

import * as compass from '../../../../docs/.vitepress/lib/orbit/compass.ts'

describe('compass words', () => {
  it.each([[0, 'N'], [359, 'N'], [45, 'NE'], [180, 'S'], [292.5, 'WNW'], [-45, 'NW']])(
    'names %f as %s',
    (degrees, point) => expect(compass.pointOf(degrees)).toBe(point)
  )
  it.each([[10, 'northbound'], [90, 'northbound'], [170, 'southbound'], [null, 'holding']] as const)(
    'reads a heading of %s as %s',
    (heading, bound) => expect(compass.boundOf({ heading })).toBe(bound)
  )
  it.each([
    ['a whole crossing', false, false, 315, 135, 'NW → SE'],
    ['a crossing up throughout', true, true, 0, 0, 'UP THROUGHOUT'],
    ['a crossing already up as the window opens', true, false, 180, 340, 'ALREADY UP → NNW'],
    ['a crossing still up as the window closes', false, true, 180, 340, 'S → STILL UP']
  ])('writes %s', (_, earlier, later, riseAz, setAz, crossing) =>
    expect(compass.crossingOf({ earlier, later, riseAz, setAz })).toBe(crossing))
})

describe('the coordinates of a spot', () => {
  it.each([
    ['north and east', { latitude: 89.91, longitude: 30 }, '89.91° N, 30.00° E'],
    ['north and west', { latitude: 42.36, longitude: -71.06 }, '42.36° N, 71.06° W'],
    ['south and east', { latitude: -33.87, longitude: 151.21 }, '33.87° S, 151.21° E'],
    ['south and west', { latitude: -16.82, longitude: -179.95 }, '16.82° S, 179.95° W'],
    ['north and east on the equator at the prime meridian', { latitude: 0, longitude: 0 }, '0.00° N, 0.00° E']
  ])('names a spot %s', (_, spot, coordinates) =>
    expect(compass.coordinatesOf(spot)).toBe(coordinates))
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
