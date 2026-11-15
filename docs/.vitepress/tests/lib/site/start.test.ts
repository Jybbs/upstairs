import { describe, expect, it } from 'vitest'

import { Face }                     from '../../lib/site/faces.ts'
import { SCHEMES, type SchemeName } from '../../lib/site/palette.ts'
import * as start                   from '../../lib/site/start.ts'
import { README, publicOf }         from '../fixtures/shipped.ts'

const faces = await Face.faces()
const CARDS = start.startPagesOf().flatMap(page =>
  (Object.keys(SCHEMES) as SchemeName[]).map(scheme => ({ page, scheme })))

describe('the start cards', () => {
  it.each(CARDS)('ships the $page card in the $scheme scheme', ({ page, scheme }) =>
    expect(publicOf(start.startFileOf(page, scheme))).toBe(start.startCardOf(faces, page, scheme)))

  it.each([
    { address: 'UPSTAIRS.FYI', page: 'Map' },
    { address: 'UPSTAIRS.FYI/GUIDE', page: 'Guide' },
    { address: 'UPSTAIRS.FYI/METHOD', page: 'Method' }
  ] as const)('sets the $page card’s address as $address', ({ address, page }) =>
    expect(start.startAddressOf(page)).toBe(address))

  it.each(CARDS)('draws the $page card in the $scheme scheme’s panel, rule, ink, and U',
    ({ page, scheme }) => {
      const { ink, panel, rule, soft, u } = SCHEMES[scheme]
      const card                          = start.startCardOf(faces, page, scheme)
      expect(card).toContain(`fill="${panel}" stroke="${rule}"`)
      expect(card).toContain(`fill="${soft}"`)
      expect(card).toContain(`color="${u}"`)
      expect(card).toContain(`fill="${ink}"`)
    })

  it.each(CARDS)('sizes the $page card to the layout’s panel', ({ page, scheme }) =>
    expect(start.startCardOf(faces, page, scheme))
      .toContain(`width="${start.START_LAYOUT.width}" height="${start.START_LAYOUT.height}"`))

  it.each(CARDS)('links the $page card in the $scheme scheme from the README to its page',
    ({ page, scheme }) => {
      const anchor = README.slice(README.lastIndexOf('<a ', README.indexOf(start.startFileOf(page, scheme))))
      expect(anchor.match(/^<a href="([^"]+)"/)?.[1]).toBe(start.startLinkOf(page).href)
    })

  it.each(start.startPagesOf())('sizes the %s card in the README to the layout’s panel', page => {
    const { height, width } = start.START_LAYOUT
    expect(README)
      .toContain(`${start.startFileOf(page, 'day')}" alt="${page}" width="${width}" height="${height}">`)
  })

  it('centers the row of cards in the README', () =>
    expect(README).toContain(`<p align="center">\n<a href="${start.startLinkOf('Map').href}">`))

  it('sets the cards in the README in the order the pages are listed', () => {
    const at = start.startPagesOf().map(page => README.indexOf(start.startFileOf(page, 'day')))
    expect(at).toEqual(at.toSorted((a, b) => a - b))
  })
})
