// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join }         from 'node:path'

import { mount }                               from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as guide         from '../../../docs/.vitepress/lib/site/guide.ts'
import GuideFigures       from '../../../docs/.vitepress/theme/GuideFigures.tsx'
import { stubMatchMedia } from '../common/stubs.ts'

const SHEET = new CSSStyleSheet()
SHEET.replaceSync(readFileSync(join(import.meta.dirname, '../../../docs/.vitepress/theme/guide.css'), 'utf8'))
const SLOTS = Object.fromEntries(guide.PARTS.map(part => [part, () => `Opening on ${part}`]))
const STACK = '.vp-doc :is(.guide-caption > span, .guide-opening)'

const ruleOf = (selector: string, rules = SHEET.cssRules) =>
  Array.from(rules)
    .find(rule => rule instanceof CSSStyleRule && rule.selectorText === selector) as CSSStyleRule

/**
 * Mounts the figures in the page, under reduced motion where `reduced` is set,
 * with `animate` counting each animation it starts, and chooses the row of
 * `part` where one is given.
 */
const mounted = async (part?: guide.Part, reduced = false) => {
  stubMatchMedia(query => reduced === query.includes('reduce'))
  const animate = vi.spyOn(HTMLElement.prototype, 'animate').mockReturnValue({} as Animation)
  const wrapper = mount(GuideFigures, { attachTo: document.body, slots: SLOTS })
  if (part) {
    const row = wrapper.findAll('.guide-row').find(each => each.text().includes(guide.CONTROLS[part].title))
    await row?.trigger('click')
    await wrapper.vm.$nextTick()
  }
  return { animate, wrapper }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('the Guide’s figures', () => {
  it.each([
    [undefined, 'map', ['2The Readout', '3Choosing the Spot', '4The Time Strip', '5The Pass List']],
    ['readout', 'readout', ['1The Map', '3Choosing the Spot', '4The Time Strip', '5The Pass List']]
  ] as const)('with %s chosen, shows the %s on the stage and every other control in the rail',
    async (part, shown, rows) => {
      const { wrapper } = await mounted(part)
      expect(wrapper.get('.guide-stage').attributes('aria-label')).toBe(guide.CONTROLS[shown].title)
      expect(wrapper.findAll('.guide-row').map(row => row.text())).toEqual(rows)
    })

  it('stacks every opening, leaving all but the chosen one inert', async () => {
    const { wrapper } = await mounted('strip')
    expect(wrapper.findAll('.guide-opening').map(opening => [opening.text(), opening.attributes('inert')]))
      .toEqual(guide.PARTS.map((part, at) => [
        `${at + 1}${guide.CONTROLS[part].title}Opening on ${part}`,
        part === 'strip' ? undefined : ''
      ]))
  })

  it('stacks every caption, leaving all but the chosen one inert', async () => {
    const { wrapper } = await mounted('spot')
    expect(wrapper.findAll('.guide-caption > span').map(caption => [caption.text(), caption.attributes('inert')]))
      .toEqual(guide.PARTS.map((part, at) => [
        `Fig. ${at + 1} · ${guide.CONTROLS[part].caption}`,
        part === 'spot' ? undefined : ''
      ]))
  })

  it.each([
    { property: 'display',    selector: '.vp-doc .guide-caption', shows: 'lays the captions in a grid',
      value: 'grid' },
    { property: 'grid-area',  selector: STACK,                    shows: 'stands each caption and opening in one cell',
      value: '1 / 1' },
    { property: 'visibility', selector: `${STACK}[inert]`,        shows: 'hides each caption and opening not chosen',
      value: 'hidden' }
  ])('$shows', ({ property, selector, value }) =>
    expect(ruleOf(selector).style.getPropertyValue(property)).toBe(value))

  it('stops the rail’s transitions under reduced motion', () => {
    const media = Array.from(SHEET.cssRules).find(rule =>
      rule instanceof CSSMediaRule && rule.conditionText === '(prefers-reduced-motion: reduce)') as CSSMediaRule
    expect(ruleOf('.vp-doc :is(.guide-row, .guide-slide-move, .guide-slide-enter-active)', media.cssRules)
      .style.getPropertyValue('transition')).toBe('none')
  })

  it('focuses the stage once a row is chosen', async () => {
    const { wrapper } = await mounted('list')
    expect(document.activeElement).toBe(wrapper.get('.guide-stage').element)
  })

  it('grows the figure out of the chosen control and raises its words', async () => {
    const { animate } = await mounted('spot')
    expect(animate.mock.calls.map(([frames]) => (frames as Keyframe[])[0])).toEqual([
      { transform: guide.zoomOf(guide.viewOf('spot')), transformOrigin: '0 0' },
      { opacity: 0, translate: '0 10px' }
    ])
  })

  it('starts no animation where the reader prefers reduced motion', async () => {
    const { animate } = await mounted('spot', true)
    expect(animate).not.toHaveBeenCalled()
  })

  it('links each title to its section', async () => {
    const { wrapper } = await mounted()
    expect(wrapper.findAll('a.guide-title').map(link => link.attributes('href')))
      .toEqual(['#the-map', '#the-readout', '#choosing-the-spot', '#the-time-strip', '#the-pass-list'])
  })
})
