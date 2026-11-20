// @vitest-environment happy-dom
import { flushPromises, mount }       from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'

import { CREDITS, type pitchOf } from '../../lib/map/credit.ts'
import { TILES }                 from '../common/credits.ts'
import { freshSky }              from '../common/sky.ts'
import { stubMatchMedia }        from '../common/stubs.ts'

const pitch = vi.hoisted(() => vi.fn<typeof pitchOf>(() => 321))

vi.mock(import('../../lib/map/credit.ts'), async load => ({ ...await load(), pitchOf: pitch }))

/**
 * Mounts the credit over a fresh copy of the shared state, its lines the ones
 * `CREDITS` adds and the base map's, inside a strip whose other control sits
 * beside it, each media query `matching` lists matching.
 */
const mounted = async (matching: readonly string[] = []) => {
  stubMatchMedia(query => matching.includes(query))
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } })
  const { component: Credit, sky } = await freshSky(() => import('../../theme/Credit.tsx'))
  sky.credit.lines.value           = [...CREDITS, TILES]
  const strip                      = document.createElement('section')
  strip.innerHTML                  = '<button class="beside" type="button"></button><div></div>'
  document.body.replaceChildren(strip)
  const wrapper                    = mount(Credit, { attachTo: strip.lastElementChild! })
  await flushPromises()
  return { sky, strip, wrapper }
}

Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable : true,
  get          : function (this: HTMLElement) { return this.closest('section') }
})

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))

it('opens and closes the band on a press of the ring, emitting open as it opens', async () => {
  const { sky, wrapper } = await mounted()
  const ring             = wrapper.get('.credit-ring')
  const panel            = wrapper.get('.credit-panel')
  await ring.trigger('click')
  expect([sky.credit.open.value, ring.attributes('aria-expanded'), panel.attributes('inert')])
    .toEqual([false, 'false', ''])
  await ring.trigger('click')
  expect([wrapper.get('.credit').attributes('data-credit'), wrapper.emitted('open')]).toEqual(['open', [[]]])
})

it.each([
  ['inside the band', '.credit-track'],
  ['on the strip it lies over', '.beside']
])('closes on Escape %s and returns the focus to the ring', async (_, selector) => {
  const { sky, strip, wrapper } = await mounted()
  strip.querySelector(selector)!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  await flushPromises()
  expect([sky.credit.open.value, document.activeElement])
    .toEqual([false, wrapper.get('.credit-ring').element])
})

it.each([
  ['wide', []],
  ['tablet', ['(width < 75rem)']],
  ['phone', ['(width < 40rem)', '(width < 75rem)']]
] as const)('measures every track’s pitch %s and sets the band’s width at it', async (mode, matching) => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(480)
  const { wrapper } = await mounted(matching)
  const set         = (name: string, selector: string) =>
    (wrapper.get(selector).element as HTMLElement).style.getPropertyValue(name)
  expect([pitch.mock.lastCall?.[1], set('--credit-pitch', '.credit-panel'), set('--credit-w', '.credit')])
    .toEqual([mode, '321px', '480px'])
})

it('seals a track with no source in a dotted ring, its own glyph scaled to the band', async () => {
  const { wrapper } = await mounted()
  const seal        = wrapper.findAll('.credit-track .seal')[3]!
  expect([
    seal.findAll('.seal-plain').length,
    seal.find('.seal-rim').exists(),
    seal.get('.seal-glyph > g').attributes('transform'),
    seal.get('.seal-glyph').attributes('transform')
  ]).toEqual([1, false, 'translate(-24 -24) scale(3)', 'translate(48 48) scale(0.9)'])
})

it('sets a track for each source under its group, every group kept in the band', async () => {
  const { wrapper } = await mounted()
  expect(wrapper.findAll('.credit-tracks').map(group =>
    [group.attributes('hidden'), group.findAll('.credit-name').map(name => name.text())]))
    .toEqual([
      [undefined, ['Space-Track', 'Terrain Tiles', 'OpenStreetMap']],
      [undefined, ['OpenFreeMap', 'OpenMapTiles']]
    ])
})

it('keeps a hyphenated last word and a © notice whole, and labels each track with its license', async () => {
  const { wrapper }                   = await mounted()
  const [orbits, terrain, , , schema] = wrapper.findAll('.credit-track')
  expect([
    orbits!.get('.whitespace-nowrap').text(),
    schema!.get('.whitespace-nowrap').text(),
    terrain!.attributes('aria-label')
  ]).toEqual(['Space-Track', '© OpenMapTiles', 'Terrain: Mapzen and its sources, Nine licenses'])
})

it('opens a tab’s group once a pointer rests on it, and never for a pointer passing through', async () => {
  const { wrapper } = await mounted()
  const tiles       = wrapper.findAll('.credit-tab')[1]!
  const shown       = () => wrapper.findAll('.credit-tracks')
    .map(group => group.attributes('inert') !== undefined)
  await tiles.trigger('pointerenter', { pointerType: 'mouse' })
  await tiles.trigger('pointerleave')
  vi.advanceTimersByTime(200)
  await flushPromises()
  expect(shown()).toEqual([false, true])
  await tiles.trigger('pointerenter', { pointerType: 'mouse' })
  vi.advanceTimersByTime(200)
  await flushPromises()
  expect(shown()).toEqual([true, false])
})

it('opens no group for a touch resting on a tab', async () => {
  const { wrapper } = await mounted()
  await wrapper.findAll('.credit-tab')[1]!.trigger('pointerenter', { pointerType: 'touch' })
  vi.advanceTimersByTime(200)
  await flushPromises()
  expect(wrapper.findAll('[role="tab"]').map(tab => tab.attributes('aria-selected')))
    .toEqual(['true', 'false'])
})

it('opens a tab’s group at once on a press', async () => {
  const { wrapper } = await mounted()
  await wrapper.findAll('.credit-tab')[1]!.trigger('click')
  expect(wrapper.findAll('[role="tab"]').map(tab => tab.attributes('aria-selected')))
    .toEqual(['false', 'true'])
})

it('stays open once the reader presses inside the band', async () => {
  const { sky, wrapper } = await mounted()
  const close            = vi.spyOn(sky.credit, 'toggle')
  await wrapper.get('.credit-panel').trigger('pointerdown')
  expect([close.mock.calls, sky.credit.open.value]).toEqual([[[true]], true])
})
