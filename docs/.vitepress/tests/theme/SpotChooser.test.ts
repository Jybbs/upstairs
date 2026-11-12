// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { ref }            from 'vue'

import { fresh } from '../fixtures/fresh.ts'

vi.mock('@vueuse/core', async original => ({
  ...await original<typeof import('@vueuse/core')>(),
  useElementSize: () => ({ height: ref(240) })
}))

type Wrapper = ReturnType<typeof mount>

/**
 * Mounts the spot chooser, 240 pixels tall and opened, over a fresh copy of
 * the shared state and a stand-in worker, on a phone where `phone` is set.
 */
const mounted = async (phone = false) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener() {}, matches: phone && query.includes('40rem'), removeEventListener() {}
  }))
  vi.stubGlobal('Worker', class { postMessage() {} })
  const [{ sky }, { default: SpotChooser }] = await fresh(() =>
    Promise.all([import('../../lib/state/sky.ts'), import('../../theme/SpotChooser.vue')]))
  sky.choose()
  return { sky, wrapper: mount(SpotChooser, { attachTo: document.body }) }
}

it.each([
  ['names the town under the pin above its latitude and longitude', 'Paris', ['PARIS', '48.86° N, 2.29° E']],
  ['gives the latitude and longitude where the pin stands on no town', null, ['48.86° N, 2.29° E']]
] as const)('%s', async (_, place, lines) => {
  const { sky, wrapper } = await mounted()
  sky.aim.value          = { place, spot: { latitude: 48.86, longitude: 2.29 } }
  await wrapper.vm.$nextTick()
  const read = wrapper.findAll('p').slice(1, 1 + lines.length).map(line => line.text().toUpperCase())
  expect(read).toEqual(lines)
})

it.each([
  ['sets the spot under the pin', (wrapper: Wrapper) => wrapper.get('button').trigger('click'), 'land'],
  ['leaves on Cancel', (wrapper: Wrapper) => wrapper.findAll('button')[1].trigger('click'), 'shut'],
  ['leaves on Escape', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), 'shut']
] as const)('%s', async (_, act, leave) => {
  const { sky, wrapper } = await mounted()
  const left             = vi.spyOn(sky, leave)
  await act(wrapper)
  expect(left).toHaveBeenCalled()
})

it.each([
  ['leaves on a press outside the chooser and the map', '', 'shut'],
  ['stays open on a press of the map', 'data-map', 'open']
] as const)('%s', async (_, marked, choosing) => {
  const { sky } = await mounted()
  const outside = document.body.appendChild(document.createElement('div'))
  if (marked) outside.setAttribute(marked, '')
  outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  outside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(sky.choosing.value).toBe(choosing)
  outside.remove()
})

it.each([
  ['raises the map by its height on a phone', true, 240],
  ['leaves the map where it stands wider than a phone', false, 0]
] as const)('%s', async (_, phone, raised) => {
  const { sky } = await mounted(phone)
  expect(sky.raised.value).toBe(raised)
})

it('sets the name under the pin in the heaviest weight of the mono', async () => {
  const { sky, wrapper } = await mounted()
  sky.aim.value          = { place: 'Paris', spot: { latitude: 48.86, longitude: 2.29 } }
  await wrapper.vm.$nextTick()
  expect(wrapper.get('[aria-live="polite"]').classes())
    .toEqual(expect.arrayContaining(['font-mono', 'font-extrabold']))
})
