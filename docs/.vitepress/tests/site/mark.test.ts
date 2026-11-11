import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import MARK from '../../lib/site/mark.json' with { type: 'json' }
import { drawnWordOf, fadedWordOf, faviconOf, wordmarkOf } from '../../lib/site/mark.ts'
import { SCHEMES, type SchemeName }                        from '../../lib/site/palette.ts'

const DRAWINGS = [
  { drawing: 'the word’s drawing alone',            height: 72, outlined: false, u: MARK.word },
  { drawing: 'the word’s drawing over the outline', height: 60, outlined: true,  u: MARK.word },
  { drawing: 'the 16 px drawing over the outline',  height: 28, outlined: true,  u: MARK.s16.d }
]
const NAMES    = Object.keys(SCHEMES) as SchemeName[]
const WORDS    = [
  { drawn: drawnWordOf, word: 'the settled word' },
  { drawn: fadedWordOf, word: 'the faded word' }
]
const DRAWN    = DRAWINGS.flatMap(drawing => WORDS.map(word => ({ ...drawing, ...word })))

const publicOf = (file: string) => readFileSync(new URL(`../../../public/${file}`, import.meta.url), 'utf8')

describe('the word', () => {
  it.each(DRAWN)('sets the U of $word at $height px in $drawing', ({ drawn, height, outlined, u }) => {
    const word = drawn(height, '#000000', '#ffffff')
    expect(word).toContain(`d="${u}"`)
    expect(word.includes(`d="${MARK.capital}"`)).toBe(outlined)
  })
  it.each(WORDS)('sets the U of $word in its own color', ({ drawn }) =>
    expect(drawn(72, '#000000', '#ffffff')).toContain(`d="${MARK.word}" fill="#ffffff"`))
  it('sets the settled word’s lowercase and tittle in ink', () =>
    expect(drawnWordOf(72, '#000000', '#ffffff'))
      .toContain(`<path d="${MARK.lowercase}${MARK.tittle}" fill="#000000"/>`))
  it('fills the faded word’s lowercase from the U’s color to ink across the p to the a', () => {
    const faded = fadedWordOf(72, '#000000', '#ffffff')
    expect(faded).toContain(`x1="${MARK.fade.from}" x2="${MARK.fade.to}" y1="0" y2="0"`)
    expect(faded).toMatch(/<stop offset="0" stop-color="#ffffff"\/><stop offset="1" stop-color="#000000"\/>/)
    expect(faded).toContain(`<path d="${MARK.lowercase}" fill="url(#fade)"/>`)
  })
  it('sets the faded word’s tittle in the U’s color', () =>
    expect(fadedWordOf(72, '#000000', '#ffffff')).toContain(`<path d="${MARK.tittle}" fill="#ffffff"/>`))
})

describe('the files the README and the browser read', () => {
  it('ships the favicon the mark draws', () => expect(publicOf('favicon.svg')).toBe(faviconOf()))
  it.each(NAMES)('ships the README’s word in the %s scheme', scheme =>
    expect(publicOf(`wordmark-${scheme}.svg`)).toBe(wordmarkOf(scheme)))
  it.each(NAMES)('colors the favicon’s U as the %s scheme colors the word’s', scheme =>
    expect(faviconOf()).toContain(`fill:${SCHEMES[scheme].u}`))
})
