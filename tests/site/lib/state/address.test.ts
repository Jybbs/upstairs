import { describe, expect, it } from 'vitest'

import { DECIMALS, fragmentOf, kindsIn, spotIn } from '../../../../docs/.vitepress/lib/state/address.ts'

describe('the address', () => {
  it.each([
    [{ latitude: 42.36012, longitude: -71.05891 }, '#42.36,-71.06'],
    [{ latitude: -33.8688, longitude: 151.2093 }, '#-33.87,151.21'],
    [{ latitude: 0.004, longitude: 179.996 }, '#0.00,180.00']
  ])('writes %o rounded to two decimals as %s', (spot, fragment) =>
    expect(fragmentOf(spot, null)).toBe(fragment))
  it.each([{ latitude: 51.5, longitude: -0.1246 }, { latitude: -90, longitude: 3.14159 }])(
    'writes each coordinate of %o with the decimals the Data page states',
    spot => expect(fragmentOf(spot, null))
      .toMatch(new RegExp(`^#-?\\d+\\.\\d{${DECIMALS}},-?\\d+\\.\\d{${DECIMALS}}$`))
  )
  it.each([
    ['#42.36,-71.06', { latitude: 42.36, longitude: -71.06 }],
    ['#90,180', { latitude: 90, longitude: 180 }],
    ['#90.01,0', null],
    ['#0,-180.01', null],
    ['#42.36', null],
    ['#,', null],
    ['#boston', null],
    ['', null],
    ['#42.36,-71.06?kinds=crewed', { latitude: 42.36, longitude: -71.06 }],
    ['#?kinds=crewed', null]
  ])('reads %s as %o', (fragment, spot) => expect(spotIn(fragment)).toEqual(spot))
  it.each([
    [{ latitude: 42.36, longitude: -71.06 }, ['crewed', 'starlink'], '#42.36,-71.06?kinds=crewed,starlink'],
    [null, ['earth'], '#?kinds=earth'],
    [null, [], '#?kinds='],
    [null, null, '']
  ] as const)('writes %o beside the kinds %o as %j', (spot, kinds, fragment) =>
    expect(fragmentOf(spot, kinds)).toBe(fragment))
  it.each([
    ['#42.36,-71.06?kinds=starlink,crewed', ['crewed', 'starlink']],
    ['#?kinds=earth,moons', ['earth']],
    ['#?kinds=', []],
    ['#?kinds=crewed%2Cweather', ['crewed', 'weather']],
    ['#42.36,-71.06', null],
    ['#?at=1', null],
    ['', null]
  ])('reads the kinds shown in %j as %o, in the order of KINDS', (fragment, kinds) =>
    expect(kindsIn(fragment)).toEqual(kinds))
})
