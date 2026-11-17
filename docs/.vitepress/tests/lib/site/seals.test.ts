import { describe, expect, it } from 'vitest'

import { Face }                     from '../../../lib/site/faces.ts'
import { SCHEMES, type SchemeName } from '../../../lib/site/palette.ts'
import * as seals                   from '../../../lib/site/seals.ts'
import { README, publicOf }         from '../../common/shipped.ts'

const faces  = await Face.faces()
const IMAGES = seals.SOURCES.flatMap(source =>
  (Object.keys(SCHEMES) as SchemeName[]).map(scheme => ({ id: source.id, scheme, source })))

describe('the seals’ images', () => {
  it.each(IMAGES)('ships the $id seal in the $scheme scheme', ({ scheme, source }) =>
    expect(publicOf(seals.sealFileOf(source, scheme))).toBe(seals.sealImageOf(faces, source, scheme)))

  it.each(IMAGES)('draws the $id seal in the $scheme scheme’s U', ({ scheme, source }) =>
    expect(seals.sealImageOf(faces, source, scheme)).toContain(`stroke="${SCHEMES[scheme].u}"`))

  it.each(IMAGES)('sets every word of the $id seal in the $scheme scheme as outlines', ({ scheme, source }) =>
    expect(seals.sealImageOf(faces, source, scheme)).not.toContain('<text'))

  it.each(seals.SOURCES)('links the $name seal in the README to its record on Data', source => {
    const at     = README.indexOf(seals.sealFileOf(source, 'night'))
    const anchor = README.slice(README.lastIndexOf('<a ', at))
    expect(anchor.match(/^<a href="([^"]+)"/)?.[1]).toBe(seals.sealLinkOf(source).href)
    expect(README).toContain(`${seals.sealFileOf(source, 'day')}" alt="${source.name}"`)
    expect(README).toContain(
        '<source media="(prefers-color-scheme: dark)" '
      + `srcset="../docs/public/${seals.sealFileOf(source, 'night')}">`)
  })

  it('sets the seals in the README in the order of the strip', () => {
    const at = seals.SOURCES.map(source => README.indexOf(seals.sealFileOf(source, 'day')))
    expect(at).toEqual(at.toSorted((a, b) => a - b))
  })
})

describe('the rim', () => {
  it.each(seals.SOURCES)('sets every letter of the $name maker and license but the spaces', source => {
    const text = `${source.maker}${source.license}`.toUpperCase().replaceAll(' ', '')
    expect(seals.rimOf(source).letters.map(letter => letter.char).join('')).toBe(text)
  })

  it.each(seals.SOURCES)('stands the $name rim upright within a letter of its top and its foot', source => {
    const letters = seals.rimOf(source).letters.toSorted((a, b) => a.y - b.y)
    const step    = Math.round(36_000 / (source.maker.length + source.license.length + 6)) / 100
    expect(Math.abs(letters[0].rotate)).toBeLessThanOrEqual(step)
    expect(Math.abs(letters.at(-1)!.rotate)).toBeLessThanOrEqual(step)
  })

  it.each(seals.SOURCES)(
    'sets the $name maker on the rim’s high baseline and its license on its low one', source => {
      const { letters }           = seals.rimOf(source)
      const maker                 = source.maker.replaceAll(' ', '').length
      const { center, high, low } = seals.SEAL
      expect(letters.map(({ x, y }) => Math.round(Math.hypot(x - center, y - center))))
        .toEqual(letters.map((_, index) => Math.round(index < maker ? high : low)))
    })

  it.each(seals.SOURCES)('rests the two dots of the $name rim level, one each side', source => {
    const [left, right] = seals.rimOf(source).dots
    expect([left.y, left.x + right.x]).toEqual([right.y, 2 * seals.SEAL.center])
  })
})

it('counts on the Terrain Tiles seal one license for each provider it lists', () =>
  expect([seals.SOURCES.find(source => source.id === 'tt')?.license, seals.PROVIDERS.length])
    .toEqual(['Nine licenses', 9]))

it('lists the Terrain Tiles providers by region in alphabetical order', () => {
  const regions = seals.PROVIDERS.map(provider => provider.region)
  expect(regions).toEqual(regions.toSorted())
})

it.each(seals.SOURCES)('opens the $name record at its fragment on Data', source =>
  expect(seals.sealLinkOf(source).href).toBe(`https://upstairs.fyi/data/#credits-${source.id}`))
