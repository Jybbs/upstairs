import { readFileSync } from 'node:fs'

import { wcagContrast }                    from 'culori'
import { beforeAll, describe, expect, it } from 'vitest'

import { Resvg } from '@resvg/resvg-js'

import { CARD, NET_LAYOUT, cardsOf, fileOf, sectionColorOf, sectionLineOf } from '../../lib/site/cards.ts'
import type { Card, Lines }                                                 from '../../lib/site/cards.ts'
import { Face, type Faces }                                                 from '../../lib/site/faces.ts'
import { SCHEMES, type SchemeName }                                         from '../../lib/site/palette.ts'
import { folderOf, sectionsOf }                                             from '../../lib/site/sections.ts'

const LINES: Lines = {
  home     : 'Every active satellite above a spot you choose.',
  sections : {
    Data   : 'Where the catalog comes from.',
    Guide  : 'How to read the map.',
    Method : 'How a pass is found.'
  }
}
const pageOf = (folder: string) =>
  readFileSync(new URL(`../../../${folder}index.md`, import.meta.url), 'utf8')
const lineOf = (folder: string) => pageOf(folder).match(/^description: (.+)$/m)![1]
const PAGES: Lines = {
  home     : lineOf(''),
  sections : Object.fromEntries(sectionsOf().map(section => [section, lineOf(`${folderOf(section)}/`)]))
} as Lines
const FILES = [fileOf(), CARD.repository.file, ...sectionsOf().map(section => fileOf(section))]
const LONG: Lines = { ...LINES, sections: { ...LINES.sections, Data: LINES.sections.Data.repeat(6) } }
const SETS = [
  { bases: [469.4, 510], section: 'Data',   size: 35, text: PAGES.sections.Data },
  { bases: [452, 510],   section: 'Guide',  size: 50, text: PAGES.sections.Guide },
  { bases: [452, 510],   section: 'Method', size: 50, text: PAGES.sections.Method },
  { bases: [510],        section: 'Data',   size: 50, text: LINES.sections.Data }
] as const
const RATIOS = (Object.keys(SCHEMES) as SchemeName[])
  .map(scheme => ({ ratio: NET_LAYOUT.contrast[scheme], scheme }))

const colorsOf = (scheme: SchemeName) =>
  sectionsOf().map(section => sectionColorOf(scheme, section))
const sizeOf   = (file: string) => file === CARD.repository.file
  ? [CARD.repository.width, CARD.repository.height]
  : [CARD.width, CARD.height]

let cards: Card[]
let faces: Faces

beforeAll(async () => {
  faces = await Face.faces()
  cards = cardsOf(faces, LINES)
})

describe('the cards', () => {
  it('writes the home card, the repository’s preview, and one card per section', () =>
    expect(cards.map(({ file }) => file)).toEqual(FILES))
  it('sizes the repository’s preview apart from every page’s card', () =>
    expect(cards.map(({ height, width }) => [width, height])).toEqual(cards.map(({ file }) => sizeOf(file))))
  it.each(FILES)('sizes the drawing of %s at the size it declares', file => {
    const { height, svg, width } = cards.find(card => card.file === file)!
    const tree                   = new Resvg(svg, { font: { loadSystemFonts: false } })
    expect([tree.width, tree.height]).toEqual([width, height])
  })
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

describe('a section’s card', () => {
  it.each(sectionsOf())('rules the %s card’s net, folder, and mark in its color', section => {
    const { svg } = cards.find(({ file }) => file === fileOf(section))!
    const color   = sectionColorOf(CARD.scheme, section)
    expect(svg).toContain('<g mask="url(#cut)"><path d="')
    expect(svg.match(new RegExp(`(?:fill|stroke)="${color}"`, 'g'))).toHaveLength(3)
  })
})

describe('a section’s line', () => {
  it('fits every page’s own line on its card', () => expect(() => cardsOf(faces, PAGES)).not.toThrow())
  it.each(SETS)('sets “$text” at $size px on the baselines $bases', ({ bases, section, size, text }) => {
    const set = sectionLineOf(faces, text, section)
    expect([set.size, set.bases.length]).toEqual([size, bases.length])
    set.bases.forEach((base, i) => expect(base).toBeCloseTo(bases[i]))
  })
  it.each(sectionsOf())('draws the %s card’s line at the size and on the baselines it sets', section => {
    const { svg } = cardsOf(faces, PAGES).find(({ file }) => file === fileOf(section))!
    const set     = sectionLineOf(faces, PAGES.sections[section], section)
    set.lines.forEach((text, i) =>
      expect(svg)
        .toContain(faces.book.outlineTo({ size: set.size, text }, NET_LAYOUT.line.right, set.bases[i])))
  })
  it('draws a line that fits on one line on the card’s last baseline', () => {
    const { svg }                = cards.find(({ file }) => file === fileOf('Data'))!
    const { bases, right, size } = NET_LAYOUT.line
    expect(svg).toContain(faces.book.outlineTo({ size, text: LINES.sections.Data }, right, bases.at(-1)!))
  })
  it('stops the build where a line runs past the card', () =>
    expect(() => cardsOf(faces, LONG)).toThrow('The line on the Data card'))
})

describe('a section’s color', () => {
  it.each(RATIOS)('holds $ratio to 1 on the $scheme page', ({ ratio, scheme }) =>
    colorsOf(scheme).forEach(color =>
      expect(wcagContrast(color, SCHEMES[scheme].page)).toBeGreaterThanOrEqual(ratio)))
  it.each(RATIOS)('stays apart from every other section’s in the $scheme scheme', ({ scheme }) =>
    expect(new Set(colorsOf(scheme)).size).toBe(sectionsOf().length))
})
