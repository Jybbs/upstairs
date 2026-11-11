// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi }       from 'vitest'

vi.mock('vitepress', () => ({ defineClientComponent: () => ({ render: () => null }) }))

const resized = vi.hoisted(() => ({ run: () => {} }))

vi.mock('@vueuse/core', () => ({ useResizeObserver: (_: unknown, run: () => void) => { resized.run = run } }))

/**
 * Mounts the 404 page over a fresh copy of the shared state and a stand-in
 * worker.
 */
const mounted = async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.resetModules()
  const { sky }               = await import('../../lib/state/sky.ts')
  const { default: NotFound } = await import('../../theme/NotFound.vue')
  return { sky, wrapper: mount(NotFound) }
}

it('gathers the sky into 404 holding the hour, and back to the present on a second press', async () => {
  const { sky, wrapper } = await mounted()
  const numeral          = wrapper.get('button')
  const pressed          = async () => {
    await numeral.trigger('click')
    await flushPromises()
    return [numeral.attributes('aria-pressed'), sky.gather.value !== null, sky.clock.value]
  }
  expect([await pressed(), await pressed()]).toEqual([['true', true, 'held'], ['false', false, 'live']])
})

it('lets the sky go and returns to the present once it unmounts gathered', async () => {
  const { sky, wrapper } = await mounted()
  await wrapper.get('button').trigger('click')
  await flushPromises()
  wrapper.unmount()
  await flushPromises()
  expect([sky.gather.value, sky.clock.value]).toEqual([null, 'live'])
})

it('gathers the sky again into the room a resized frame leaves, only while it is gathered', async () => {
  const { sky, wrapper } = await mounted()
  resized.run()
  await flushPromises()
  const before = sky.gather.value
  await wrapper.get('button').trigger('click')
  await flushPromises()
  const room = sky.gather.value
  resized.run()
  await flushPromises()
  expect([before, sky.gather.value === room, sky.gather.value]).toEqual([null, false, room])
})

it('names the address that holds no page, before the way back to the map', async () => {
  history.replaceState(null, '', '/no-such-page/')
  const { default: NotFound } = await import('../../theme/NotFound.vue')
  const wrapper               = mount(NotFound)
  await wrapper.vm.$nextTick()
  expect(wrapper.findAll('p').map(line => line.text())).toEqual(
    ['Not found', `There is no page at ${location.host}/no-such-page/.`])
  expect(wrapper.findAll('a, button').map(control => control.text())).toEqual(['Back to the map', '404'])
})
