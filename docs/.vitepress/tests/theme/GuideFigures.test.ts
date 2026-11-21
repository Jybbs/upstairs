// @vitest-environment happy-dom
import { mount }                               from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as guide         from '../../lib/site/guide.ts'
import GuideFigures       from '../../theme/GuideFigures.tsx'
import { stubMatchMedia } from '../common/stubs.ts'

const SLOTS = Object.fromEntries(guide.PARTS.map(part => [part, () => `Opening on ${part}`]))

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
