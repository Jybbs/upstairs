import { wcagContrast }         from 'culori'
import { describe, expect, it } from 'vitest'

import { FLOORS }                                 from '../../lib/map/style.ts'
import { KINDS, type Kind }                       from '../../lib/orbit/kinds.ts'
import { SCHEMES, cssOf, kindColor, type Scheme } from '../../lib/site/palette.ts'

const SELECTORS: Readonly<Record<string, string>> = { day: ':root', night: 'html.dark' }
const SURFACES                                    = ['page', 'panel', 'lift'] as const
const TEXTS                                       = ['ink', 'soft', 'u'] as const
const blocks   = Object.fromEntries(cssOf().split('}').filter(Boolean).map(block => block.split('{')))
const kinds    = Object.keys(KINDS) as Kind[]
const schemes  = Object.entries(SCHEMES) as [string, Scheme][]
const declared = schemes.flatMap(([name, scheme]) => [
  ...Object.entries(scheme).filter(([, value]) => typeof value === 'string'),
  ...Object.entries(scheme.kinds).map(([kind, color]) => [`kind-${kind}`, color])
].map(([token, value]) => [name, `--${token}:${value}`]))

describe.each(schemes)('the %s scheme', (_, scheme) => {
  it.each(TEXTS.flatMap(text => SURFACES.map(surface => [text, surface])))(
    'sets %s on %s at 4.5 to 1 or more',
    (text, surface) => expect(wcagContrast(scheme[text], scheme[surface])).toBeGreaterThanOrEqual(4.5)
  )
  it.each(kinds)('holds the %s color at 3 to 1 on every band and on the panel', kind => {
    const color   = scheme.kinds[kind]
    const grounds = [scheme.ground, ...scheme.bands, scheme.panel]
    expect(Math.min(...grounds.map(ground => wcagContrast(color, ground)))).toBeGreaterThanOrEqual(3)
  })
  it('gives one color to each elevation band', () => expect(scheme.bands).toHaveLength(FLOORS.length))
})

describe('the stylesheet', () => {
  it.each(declared)('declares the %s token %s under the selector of its scheme', (name, declaration) =>
    expect(blocks[SELECTORS[name]].split(';')).toContain(declaration))
  it.each(kinds)('names the custom property holding the %s color', kind =>
    expect(blocks[':root']).toContain(`${kindColor(kind).slice(4, -1)}:`))
})
