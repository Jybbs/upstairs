// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

type Wrapper = ReturnType<typeof mount>

/**
 * Mounts the spot chooser, opened, over a fresh copy of the shared state and a
 * stand-in worker.
 */
const mounted = async () => {
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.resetModules()
  const { sky }                  = await import('../../lib/state/sky.ts')
  const { default: SpotChooser } = await import('../../theme/SpotChooser.vue')
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
