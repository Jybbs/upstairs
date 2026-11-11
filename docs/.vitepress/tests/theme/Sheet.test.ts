// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { TRACK_WIDTH } from '../../lib/orbit/scan.ts'
import { passOf }      from '../fixtures/passes.ts'

/**
 * Mounts a phone's sheet over a fresh copy of the shared state and a stand-in
 * worker, its panels stubbed, with one pass in the scan, pinned where `pinned`
 * is set.
 */
const mounted = async (pinned: boolean) => {
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.resetModules()
  const { sky }            = await import('../../lib/state/sky.ts')
  const { default: Sheet } = await import('../../theme/Sheet.vue')
  const pass               = passOf(1)
  const stubs              = { Filters: true, PassList: true, PassReadout: true, Readout: true, TimeStrip: true }
  sky.tracks.add([pass], new Float32Array(TRACK_WIDTH), Uint32Array.of(0), 1)
  sky.version.value++
  const wrapper = mount(Sheet, { global: { stubs } })
  if (pinned) sky.pin(pass)
  await wrapper.vm.$nextTick()
  return { sky, wrapper }
}

it.each([
  ['rises from peek to full and back down to peek with no pass pinned', false,
    ['Raise the sheet', 'Lower the sheet', 'Raise the sheet']],
  ['rests at half once a pass is pinned, and rises to full and back down to half', true,
    ['Raise the sheet to the hour’s list', 'Lower the sheet', 'Raise the sheet to the hour’s list']]
] as const)('%s', async (_, pinned, labels) => {
  const { wrapper } = await mounted(pinned)
  const handle      = wrapper.get('button')
  const read        = [handle.attributes('aria-label')]
  for (const _press of [1, 2]) {
    await handle.trigger('click')
    read.push(handle.attributes('aria-label'))
  }
  expect(read).toEqual(labels)
})

it('falls back to peek once the pinned pass is let go', async () => {
  const { sky, wrapper } = await mounted(true)
  sky.release()
  await wrapper.vm.$nextTick()
  expect(wrapper.get('button').attributes('aria-label')).toBe('Raise the sheet')
})

it('uncovers the map once it unmounts', async () => {
  const { sky, wrapper } = await mounted(false)
  sky.covered.value      = 120
  wrapper.unmount()
  expect(sky.covered.value).toBe(0)
})
