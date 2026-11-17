// @vitest-environment happy-dom
import { flushPromises, mount }       from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'

import { CREDITS }        from '../../lib/map/credit.ts'
import { TILES }          from '../common/credits.ts'
import { freshSky }       from '../common/sky.ts'
import { stubMatchMedia } from '../common/stubs.ts'


/**
 * Mounts the credit over a fresh copy of the shared state, its lines the ones
 * `CREDITS` adds and the base map's.
 */
const mounted = async () => {
  stubMatchMedia(() => false)
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } })
  const { component: Credit, sky } = await freshSky(() => import('../../theme/Credit.tsx'))
  sky.credit.lines.value           = [...CREDITS, TILES]
  const wrapper                    = mount(Credit, { attachTo: document.body })
  await flushPromises()
  return { sky, wrapper }
}

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

it('closes on Escape and returns the focus to the ring', async () => {
  const { sky, wrapper } = await mounted()
  await wrapper.get('.credit-track').trigger('keydown', { key: 'Escape' })
  expect([sky.credit.open.value, document.activeElement])
    .toEqual([false, wrapper.get('.credit-ring').element])
})

it('sets a track for each source under its group, every group kept in the band', async () => {
  const { wrapper } = await mounted()
  expect(wrapper.findAll('.credit-tracks').map(group =>
    [group.attributes('hidden'), group.findAll('.credit-name').map(name => name.text())]))
    .toEqual([
      [undefined, ['CelesTrak', 'Terrain Tiles', 'OpenStreetMap']],
      [undefined, ['OpenFreeMap', 'OpenMapTiles']]
    ])
})

it('keeps a hyphenated last word whole and labels each track with its license', async () => {
  const { wrapper } = await mounted()
  const [orbits, terrain] = wrapper.findAll('.credit-track')
  expect([orbits!.get('.whitespace-nowrap').text(), terrain!.attributes('aria-label')])
    .toEqual(['Space-Track', 'Terrain: Mapzen and its sources, Nine licenses'])
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
