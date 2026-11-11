// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { kindOrder, type Kind } from '../../lib/orbit/kinds.ts'

/**
 * Mounts the tally over a fresh copy of the shared state, reading `counts` by
 * kind off the map, every kind it leaves out at zero.
 */
const mounted = async (counts: Partial<Record<Kind, number>>) => {
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.resetModules()
  const { sky }            = await import('../../lib/state/sky.ts')
  const { default: Tally } = await import('../../theme/Tally.vue')
  const kinds              = kindOrder.map(kind => counts[kind] ?? 0)
  sky.reading.value        = { above: 0, aboveKinds: kinds, kinds, onMap: 0 }
  return { sky, wrapper: mount(Tally, { attachTo: document.body }) }
}

it('draws a group for each kind on the map and none for a kind with nothing up', async () => {
  const { wrapper } = await mounted({ crewed: 2, earth: 5 })
  expect(wrapper.findAll('button').map(button => button.attributes('aria-label')))
    .toEqual(['Crewed, 2 on this map', 'Earth, 5 on this map'])
})

it('names the kind a tap holds, lets it go on a second tap, and lets it go on Escape', async () => {
  const { sky, wrapper } = await mounted({ crewed: 2, earth: 5 })
  const [, earth]        = wrapper.findAll('button')
  await earth.trigger('click')
  expect([sky.named.value, earth.attributes('aria-pressed')]).toEqual(['earth', 'true'])
  await earth.trigger('click')
  expect(sky.named.value).toBe(null)
  await earth.trigger('click')
  await earth.trigger('keydown', { key: 'Escape' })
  expect(sky.named.value).toBe(null)
})

it('dims every group but the one named', async () => {
  const { wrapper }     = await mounted({ crewed: 2, earth: 5 })
  const [crewed, earth] = wrapper.findAll('button')
  await earth.trigger('click')
  expect([crewed.classes('opacity-25'), earth.classes('opacity-25')]).toEqual([true, false])
})

it('lets a held kind go once its group leaves the tally', async () => {
  const { sky, wrapper } = await mounted({ crewed: 2, earth: 5 })
  await wrapper.findAll('button')[1].trigger('click')
  sky.reading.value = { ...sky.reading.value, kinds: kindOrder.map(kind => kind === 'crewed' ? 2 : 0) }
  await wrapper.vm.$nextTick()
  expect(sky.named.value).toBe(null)
})

it.each([
  ['names the kind a mouse rests on and lets it go as the mouse leaves', 'mouse', 'earth'],
  ['leaves a touch to the tap rather than naming on contact', 'touch', null]
] as const)('%s', async (_, pointerType, named) => {
  const { sky, wrapper } = await mounted({ crewed: 2, earth: 5 })
  const earth            = wrapper.findAll('button')[1]
  await earth.trigger('pointerenter', { pointerType })
  expect(sky.named.value).toBe(named)
  await earth.trigger('pointerleave', { pointerType })
  expect(sky.named.value).toBe(null)
})
