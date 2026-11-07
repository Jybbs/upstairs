import { describe, expect, it } from 'vitest'

import { boundOf, crossingOf, pointOf } from '../../src/orbit/compass.ts'
import { kindOf, type Kind } from '../../src/orbit/kinds.ts'

describe('kindOf', () => {
  it.each<[string, Kind]>([
    ['STARLINK-34010', 'starlink'], ['ISS (ZARYA)', 'crewed'], ['CSS (TIANHE)', 'crewed'], ['CXO', 'science'],
    ['SWOT', 'earth'], ['GOES 19', 'weather'], ['NAVSTAR 51 (USA 166)', 'navigation'], ['ONEWEB-0178', 'comms'],
    ['CALSPHERE 1', 'other'],
  ])('reads %s as %s', (name, kind) => expect(kindOf(name)).toBe(kind))
})

describe('compass words', () => {
  it.each([[0, 'N'], [359, 'N'], [45, 'NE'], [180, 'S'], [292.5, 'WNW']])('names %f as %s', (degrees, point) =>
    expect(pointOf(degrees)).toBe(point))
  it.each([[10, 'northbound'], [170, 'southbound'], [null, 'holding']] as const)('reads a heading of %s as %s', (heading, bound) =>
    expect(boundOf({ heading })).toBe(bound))
  it('writes a whole crossing and one that is up throughout', () => {
    expect(crossingOf({ riseAz: 315, setAz: 135, earlier: false, later: false })).toBe('NW → SE')
    expect(crossingOf({ riseAz: 0, setAz: 0, earlier: true, later: true })).toBe('UP THROUGHOUT')
    expect(crossingOf({ riseAz: 180, setAz: 340, earlier: true, later: false })).toBe('ALREADY UP → NNW')
    expect(crossingOf({ riseAz: 180, setAz: 340, earlier: false, later: true })).toBe('S → STILL UP')
  })
})
