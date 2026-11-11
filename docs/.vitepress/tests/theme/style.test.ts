// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join }         from 'node:path'

import { describe, expect, it } from 'vitest'

const LINK  = '.vp-doc a:not(.header-anchor, .footnote-ref > a, .footnote-backref)'
const SHEET = new CSSStyleSheet()
SHEET.replaceSync(readFileSync(join(import.meta.dirname, '../../theme/style.css'), 'utf8'))

const ruleOf  = (selector: string, rules = SHEET.cssRules) =>
  Array.from(rules)
    .find(rule => rule instanceof CSSStyleRule && rule.selectorText === selector) as CSSStyleRule
const styleOf = (selector: string, property: string) => ruleOf(selector).style.getPropertyValue(property)
const morseOf = (image: string) => [...image.matchAll(/var\(--u\) (\d+)(?:px)? (\d+)px/g)]
  .map(([, from, to]) => Number(to) - Number(from))
  .map((length, _, lengths) => length > Math.min(...lengths) ? '-' : '.')
  .join('')

describe('a link in a page', () => {
  it.each(['--vp-c-brand-1', '--vp-c-brand-2'])('keeps %s in the U', property =>
    expect(styleOf(':root, html.dark', property)).toBe('var(--u)'))
  it('keeps --vp-c-brand-3 at the theme’s own, where a brand button sets white text', () =>
    expect(styleOf(':root, html.dark', '--vp-c-brand-3')).toBe(''))
  it.each([
    { property: 'padding-bottom',       shows: 'draws the underline in the 3 px below the text',
      value: '3px' },
    { property: 'text-decoration',      shows: 'drops the theme’s underline for its own',
      value: 'none' },
    { property: 'background-repeat',    shows: 'draws the Morse and the resting line once each',
      value: 'no-repeat' },
    { property: 'box-decoration-break', shows: 'keys each line of a wrapped link from its start',
      value: 'clone' },
    { property: 'background-position',  shows: 'retracts the resting line toward the link’s end',
      value: '0px calc(100% - 2.5px), 100% calc(100% - 3px)' },
    { property: 'transition',           shows: 'runs the keying over --key-run on --key-ease',
      value: 'color 0.25s, background-size var(--key-run) var(--key-ease)' }
  ])('$shows', ({ property, value }) => expect(styleOf(LINK, property)).toBe(value))
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
  it('waits 200 ms and runs 620 ms on a cubic-bezier ease', () =>
    expect([styleOf(LINK, '--key-wait'), styleOf(LINK, '--key-run'), styleOf(LINK, '--key-ease')])
      .toEqual(['200ms', '620ms', 'cubic-bezier(0.45, 0, 0.2, 1)']))
  it('shows the keyed state at once under reduced motion', () => {
    const media = Array.from(SHEET.cssRules).find(rule => rule instanceof CSSMediaRule) as CSSMediaRule
    expect(media.conditionText).toBe('(prefers-reduced-motion: reduce)')
    expect(ruleOf(LINK, media.cssRules).style.getPropertyValue('transition')).toBe('none')
  })
})
