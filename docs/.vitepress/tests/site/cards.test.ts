import { wcagContrast }                    from 'culori'
import { beforeAll, describe, expect, it } from 'vitest'

import { Resvg } from '@resvg/resvg-js'

import { CARD, NET_LAYOUT, cardsOf, fileOf, sectionColorOf } from '../../lib/site/cards.ts'
import type { Card, Lines }                                  from '../../lib/site/cards.ts'
import { Face }                                              from '../../lib/site/faces.ts'
import { SCHEMES, type SchemeName }                          from '../../lib/site/palette.ts'
import { folderOf, sectionsOf }                              from '../../lib/site/sections.ts'

const LINES: Lines = {
  home     : 'Every active satellite above a spot you choose.',
  sections : {
    Data   : 'Where the catalog comes from.',
    Guide  : 'How to read the map.',
    Method : 'How a pass is found.'
  }
}
const RATIOS = (Object.keys(SCHEMES) as SchemeName[])
  .map(scheme => ({ ratio: NET_LAYOUT.contrast[scheme], scheme }))

const colorsOf = (scheme: SchemeName) =>
  sectionsOf().map(section => sectionColorOf(scheme, section))
const sizeOf   = (file: string) => file === CARD.repository.file
  ? [CARD.repository.width, CARD.repository.height]
  : [CARD.width, CARD.height]

let cards: Card[]

beforeAll(async () => {
  cards = cardsOf(await Face.faces(), LINES)
})

describe('the cards', () => {
  it('writes the home card, the repository’s preview, and one card per section', () =>
    expect(cards.map(({ file }) => file))
      .toEqual([fileOf(), CARD.repository.file, ...sectionsOf().map(section => fileOf(section))]))
  it('sizes the repository’s preview apart from every page’s card', () =>
    expect(cards.map(({ height, width }) => [width, height])).toEqual(cards.map(({ file }) => sizeOf(file))))
  it('renders each card at the size it declares', () => cards.forEach(({ height, svg, width }) => {
    const image = new Resvg(svg, { font: { loadSystemFonts: false } }).render()
    expect([image.width, image.height]).toEqual([width, height])
  }))
  it('sets every word as an outline', () => cards.forEach(({ svg }) => expect(svg).not.toContain('<text')))
  it('draws every card on the night page', () =>
    cards.forEach(({ svg }) => expect(svg).toContain(`fill="${SCHEMES.night.page}"/>`)))
  it('draws every card on the Daylight page with no glow once the scheme is Daylight', async () =>
    cardsOf(await Face.faces(), LINES, { ...CARD, scheme: 'day' }).forEach(({ svg }) => {
      expect(svg).toContain(`fill="${SCHEMES.day.page}"/>`)
      expect(svg).not.toContain('filter="url(#glow)"')
    }))
  it('fades the word on the home card and the repository’s preview alone', () =>
    expect(cards.map(({ svg }) => svg.includes('fill="url(#fade)"')))
      .toEqual(cards.map((_, i) => i < 2)))
})

describe('a page’s card', () => {
  it('reads the home card for a page outside every section', () => expect(fileOf()).toBe('cards/home.png'))
  it.each(sectionsOf())('reads the %s card under its folder', section =>
    expect(fileOf(section)).toBe(`cards/${folderOf(section)}.png`))
})

describe('a section’s color', () => {
  it.each(RATIOS)('holds $ratio to 1 on the $scheme page', ({ ratio, scheme }) =>
    colorsOf(scheme).forEach(color =>
      expect(wcagContrast(color, SCHEMES[scheme].page)).toBeGreaterThanOrEqual(ratio)))
  it.each(RATIOS)('stays apart from every other section’s in the $scheme scheme', ({ scheme }) =>
    expect(new Set(colorsOf(scheme)).size).toBe(sectionsOf().length))
})
