// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join }         from 'node:path'

import { describe, expect, it } from 'vitest'

const LINK  = '.vp-doc a:not(.header-anchor)'
const SHEET = new CSSStyleSheet()
SHEET.replaceSync(readFileSync(join(import.meta.dirname, '../../theme/style.css'), 'utf8'))

const ruleOf  = (selector: string, rules = SHEET.cssRules) =>
  Array.from(rules).find(rule => rule instanceof CSSStyleRule && rule.selectorText === selector) as CSSStyleRule
const styleOf = (selector: string, property: string) => ruleOf(selector).style.getPropertyValue(property)
const morseOf = (image: string) => [...image.matchAll(/var\(--u\) (\d+)(?:px)? (\d+)px/g)]
  .map(([, from, to]) => Number(to) - Number(from))
  .map((length, _, lengths) => length > Math.min(...lengths) ? '-' : '.')
  .join('')

describe('a link in a page', () => {
  it.each(['--vp-c-brand-1', '--vp-c-brand-2', '--vp-c-brand-3'])('keeps %s in the U', property =>
    expect(styleOf(':root, html.dark', property)).toBe('var(--u)'))
  it('keys out the U in Morse along its underline', () =>
    expect(morseOf(styleOf(LINK, 'background-image'))).toBe('..-'))
  it.each([
    { selector: LINK,                                  size: '0 2px, 100% 1px', state: 'at rest' },
    { selector: `${LINK}:is(:hover, :focus-visible)`, size: '100% 2px, 0 1px', state: 'under the pointer' }
  ])('draws the Morse at $size $state', ({ selector, size }) =>
    expect(styleOf(selector, 'background-size')).toBe(size))
  it.each([
    { delay: 'var(--key-wait)', selector: `${LINK}:is(:hover, :focus-visible)`, state: 'the pointer' },
    { delay: '0s',              selector: `${LINK}:focus-visible`,              state: 'keyboard focus' }
  ])('waits $delay under $state', ({ delay, selector }) =>
    expect(styleOf(selector, 'transition-delay')).toBe(delay))
  it('waits 200 ms and runs 620 ms', () =>
    expect([styleOf(LINK, '--key-wait'), styleOf(LINK, '--key-run')]).toEqual(['200ms', '620ms']))
  it('shows the keyed state at once under reduced motion', () => {
    const media = Array.from(SHEET.cssRules).find(rule => rule instanceof CSSMediaRule) as CSSMediaRule
    expect(media.conditionText).toBe('(prefers-reduced-motion: reduce)')
    expect(ruleOf(LINK, media.cssRules).style.getPropertyValue('transition')).toBe('none')
  })
})
