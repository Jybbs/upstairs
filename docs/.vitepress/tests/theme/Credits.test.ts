// @vitest-environment happy-dom
import { mount }                from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { PROVIDERS, SOURCES, sealAnchorOf } from '../../lib/site/seals.ts'
import Credits                              from '../../theme/Credits.tsx'

const chosenOf = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('[role="tab"]')
  .map(tab => [tab.attributes('aria-selected'), tab.attributes('tabindex')])

const openOf = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('[role="tabpanel"]')
  .map(panel => panel.attributes('inert') === undefined)

describe('the strip of seals', () => {
  it('draws one seal per source, each over its name, and opens the first source’s record', () => {
    const wrapper = mount(Credits)
    expect([wrapper.findAll('svg.seal').length, wrapper.findAll('.credits-name').map(name => name.text())])
      .toEqual([SOURCES.length, SOURCES.map(source => source.name)])
    expect(openOf(wrapper)).toEqual([true, false, false])
  })

  it.each(SOURCES.map((source, index) => ({ index, name: source.name })))(
    'opens the $name record on a press of its seal', async ({ index }) => {
      const wrapper = mount(Credits)
      await wrapper.findAll('[role="tab"]')[index].trigger('click')
      expect(openOf(wrapper)).toEqual(SOURCES.map((_, at) => at === index))
    })

  it('ties each tab to its record both ways', () => {
    const wrapper = mount(Credits)
    const panels  = wrapper.findAll('[role="tabpanel"]')
    expect(wrapper.findAll('[role="tab"]').map((tab, index) =>
      [tab.attributes('aria-controls') === panels[index].attributes('id'),
       panels[index].attributes('aria-labelledby') === tab.attributes('id')]))
      .toEqual(SOURCES.map(() => [true, true]))
  })

  it.each([
    { key: 'ArrowRight', to: 1 },
    { key: 'ArrowLeft', to: 2 },
    { key: 'End', to: 2 },
    { key: 'Home', to: 0 }
  ])('moves the choice and the focus along the strip on $key', async ({ key, to }) => {
    const wrapper = mount(Credits, { attachTo: document.body })
    await wrapper.findAll('[role="tab"]')[0].trigger('keydown', { key })
    expect([chosenOf(wrapper)[to], document.activeElement?.id])
      .toEqual([['true', '0'], sealAnchorOf(SOURCES[to])])
    wrapper.unmount()
  })

  it('leaves the choice where it stands on a key that moves nothing', async () => {
    const wrapper = mount(Credits)
    await wrapper.findAll('[role="tab"]')[0].trigger('keydown', { key: 'Enter' })
    expect(openOf(wrapper)).toEqual([true, false, false])
  })

  it.each(SOURCES)('opens the $name record when the address lands on its seal', async source => {
    location.hash = `#${sealAnchorOf(source)}`
    const wrapper = mount(Credits)
    await wrapper.vm.$nextTick()
    expect(openOf(wrapper)).toEqual(SOURCES.map(other => other === source))
    location.hash = ''
  })

  it.each(['#credits', '#credits-moon'])(
    'keeps the first record open when the address lands on %s', async hash => {
      location.hash = hash
      const wrapper = mount(Credits)
      await wrapper.vm.$nextTick()
      expect(openOf(wrapper)).toEqual([true, false, false])
      location.hash = ''
    })

  it('follows the address to another seal once the page is open', async () => {
    const wrapper = mount(Credits)
    location.hash = `#${sealAnchorOf(SOURCES[2])}`
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await wrapper.vm.$nextTick()
    expect(openOf(wrapper)).toEqual([false, false, true])
    location.hash = ''
  })
})

describe('the records', () => {
  it('sets the OpenStreetMap notice as a quote over the clause of the ODbL that requires it', () => {
    const quote = mount(Credits).get('blockquote')
    expect([quote.get('p').text(), quote.get('footer').text()])
      .toEqual(['© OpenStreetMap contributors', 'Set by ODbL § 4.3'])
  })

  it('sets the OpenStreetMap license, the data it supplies, and what carries it as chips', () => {
    const chips = mount(Credits).findAll('.credits-chip').map(chip => chip.text())
    expect(chips).toEqual([
      'ODbL 1.0', 'Lakes', 'Coastlines', 'Borders', 'OpenFreeMap', 'OpenMapTiles schema',
      'openstreetmap.org/copyright'
    ])
  })

  it('links the OpenStreetMap chip of its terms to its copyright page', () =>
    expect(mount(Credits).get('a.credits-link').attributes('href'))
      .toBe('https://www.openstreetmap.org/copyright'))

  it('quotes each Terrain Tiles provider’s statement beside its region and license', () =>
    expect(mount(Credits).findAll('.credits-providers li')
      .map(item => [item.get('.caps').text(), item.get('q').text()]))
      .toEqual(PROVIDERS.map(({ license, notice, region }) => [`${region} · ${license}`, notice])))

  it('clips the OpenStreetMap glyph’s land, coast, and border inside its own seal’s core', () => {
    const seal = mount(Credits).get('svg.seal')
    expect(seal.findAll('path[clip-path]').map(path => path.attributes('clip-path')))
      .toEqual(Array(3).fill(`url(#${seal.get('clipPath').attributes('id')})`))
  })

  it('gives each seal a clip path of its own', () => {
    const ids = mount(Credits).findAll('clipPath').map(clip => clip.attributes('id'))
    expect(new Set(ids).size).toBe(SOURCES.length)
  })
})
