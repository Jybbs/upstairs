import { describe, expect, it } from 'vitest'

import { kindOf, type Kind } from '../../../../docs/.vitepress/lib/orbit/kinds.ts'

describe('kindOf', () => {
  it.each<[string, Kind]>([
    ['STARLINK-34010', 'starlink'], ['ISS (ZARYA)', 'crewed'], ['CSS (TIANHE)', 'crewed'], ['CXO', 'science'],
    ['SWOT', 'earth'], ['GOES 19', 'weather'], ['NAVSTAR 51 (USA 166)', 'navigation'],
    ['ONEWEB-0178', 'comms'], ['CALSPHERE 1', 'other']
  ])('reads %s as %s', (name, kind) => expect(kindOf(name)).toBe(kind))
})
