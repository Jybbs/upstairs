// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { linkOf } from '../../lib/site/sections.ts'

/**
 * Mounts the readout over a fresh copy of the shared state and a stand-in
 * worker, with the scan finished and a count announced.
 */
const mounted = async (closeUp: boolean) => {
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.resetModules()
  const { sky }              = await import('../../lib/state/sky.ts')
  const { default: Readout } = await import('../../theme/Readout.vue')
  sky.done.value    = true
  sky.closeUp.value = closeUp
  sky.spoken.value  = '5 satellites above the horizon'
  return mount(Readout)
}

it('keeps the visible count silent and reads the spoken count from a polite region', async () => {
  const wrapper = await mounted(false)
  expect(wrapper.get('output').attributes('aria-live')).toBe('off')
  expect(wrapper.get('[aria-live="polite"]').text()).toBe('5 satellites above the horizon')
})

it.each([
  [true, [`${linkOf('Method')}#accuracy`]],
  [false, []]
])('links to the accuracy section where zoomed in close is %s', async (closeUp, links) => {
  const wrapper = await mounted(closeUp)
  expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(links)
})
