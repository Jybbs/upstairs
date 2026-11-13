import { Resvg }                from '@resvg/resvg-js'
import { describe, expect, it } from 'vitest'

import MARK                         from '../../lib/site/mark.json' with { type: 'json' }
import * as mark                    from '../../lib/site/mark.ts'
import { SCHEMES, type SchemeName } from '../../lib/site/palette.ts'
import { README, publicOf }         from '../fixtures/shipped.ts'

const DRAWINGS = [
  { drawing: 'the word’s drawing alone',            height: 69.7, outlined: false, u: MARK.word },
  { drawing: 'the word’s drawing over the outline', height: 69.6, outlined: true,  u: MARK.word },
  { drawing: 'the word’s drawing over the outline', height: 29.1, outlined: true,  u: MARK.word },
  { drawing: 'the 16 px drawing over the outline',  height: 29,   outlined: true,  u: MARK.s16.d }
]
const NAMES    = Object.keys(SCHEMES) as SchemeName[]
const WORDS    = [
  { drawn: mark.drawnWordOf, word: 'the settled word' },
  { drawn: mark.fadedWordOf, word: 'the faded word' }
]
const DRAWN    = DRAWINGS.flatMap(drawing => WORDS.map(word => ({ ...drawing, ...word })))

const sizeOf = (svg: string) => {
  const [, width, height] = svg.match(/ width="([\d.]+)" height="([\d.]+)"/)!.map(Number)
  return { height: height!, width: width! }
}

describe('the word', () => {
  it.each(DRAWN)('sets the U of $word at $height px in $drawing', ({ drawn, height, outlined, u }) => {
    const word = drawn(height, '#000000', '#ffffff')
    expect(word).toContain(`d="${u}"`)
    expect(word.includes(`d="${MARK.capital}"`)).toBe(outlined)
  })
  it.each(WORDS)('sets the U of $word in its own color', ({ drawn }) =>
    expect(drawn(72, '#000000', '#ffffff')).toContain(`d="${MARK.word}" fill="#ffffff"`))
  it('sets the settled word’s lowercase and tittle in ink', () =>
    expect(mark.drawnWordOf(72, '#000000', '#ffffff'))
      .toContain(`<path d="${MARK.lowercase}${MARK.tittle}" fill="#000000"/>`))
  it('fills the faded word’s lowercase from the U’s color to ink across the p to the a', () => {
    const faded = mark.fadedWordOf(72, '#000000', '#ffffff')
    expect(faded).toContain(`x1="${MARK.fade.from}" x2="${MARK.fade.to}" y1="0" y2="0"`)
    expect(faded).toMatch(/<stop offset="0" stop-color="#ffffff"\/><stop offset="1" stop-color="#000000"\/>/)
    expect(faded).toContain(`<path d="${MARK.lowercase}" fill="url(#fade)"/>`)
  })
  it('sets the faded word’s tittle in the U’s color', () =>
    expect(mark.fadedWordOf(72, '#000000', '#ffffff')).toContain(`<path d="${MARK.tittle}" fill="#ffffff"/>`))
})

describe('the files the README and the browser read', () => {
  it('ships the favicon the mark draws', () => expect(publicOf('favicon.svg')).toBe(mark.faviconOf()))
  it.each(NAMES)('ships the README’s word in the %s scheme', scheme =>
    expect(publicOf(`wordmark-${scheme}.svg`)).toBe(mark.wordmarkOf(scheme)))
  it.each(NAMES)('fades the README’s word in the %s scheme as the cards draw it', scheme => {
    const word = mark.wordmarkOf(scheme)
    expect(word).toContain(mark.fadedWordOf(sizeOf(word).height, SCHEMES[scheme].ink, SCHEMES[scheme].u))
  })
  it.each(NAMES)('sets the README’s word in the %s scheme between 480 and 640 px wide', scheme => {
    const { width } = sizeOf(mark.wordmarkOf(scheme))
    expect(width).toBeGreaterThanOrEqual(480)
    expect(width).toBeLessThanOrEqual(640)
  })
  it('sizes the README’s word to the drawing it shows', () => {
    const { height, width } = sizeOf(mark.wordmarkOf('day'))
    expect(README).toContain(`alt="upstairs" width="${width}" height="${Math.round(height)}"`)
  })
  it.each(NAMES)('colors the favicon’s U as the %s scheme colors the word’s', scheme =>
    expect(mark.faviconOf()).toContain(`fill:${SCHEMES[scheme].u}`))

  describe('the touch icon', () => {
    const touch = new Resvg(mark.touchIconOf(), { font: { loadSystemFonts: false } }).render()
    const hexOf = (value: number) => value.toString(16).padStart(2, '0')
    const pixel = (x: number, y: number) => {
      const at = (y * touch.width + x) * 4
      return `#${[...touch.pixels.subarray(at, at + 3)].map(hexOf).join('')}`
    }

    it('renders a tile the size iOS takes', () =>
      expect([touch.width, touch.height]).toEqual([mark.TOUCH.size, mark.TOUCH.size]))

    it('fills every corner with the Daylight U, leaving no pixel transparent', () => {
      const last = mark.TOUCH.size - 1
      expect([pixel(0, 0), pixel(last, 0), pixel(0, last), pixel(last, last)])
        .toEqual(Array(4).fill(SCHEMES.day.u))
    })

    it('knocks the favicon’s drawing out of the ground in the Daylight page’s color', () => {
      expect(mark.touchIconOf()).toContain(`<path d="${MARK.s16.d}" fill="${SCHEMES.day.page}"`)
      expect(mark.touchIconOf()).toContain(`viewBox="${MARK.s16.box}"`)
    })

    it('centers the drawing at 62% of the tile', () => {
      expect(mark.TOUCH.mark / mark.TOUCH.size).toBeCloseTo(0.62, 2)
      expect(mark.touchIconOf()).toContain(`x="${(mark.TOUCH.size - mark.TOUCH.mark) / 2}"`)
    })
  })
})
