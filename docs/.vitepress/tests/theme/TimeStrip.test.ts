// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

/**
 * Mounts the time strip over a fresh copy of the shared state and a stand-in
 * worker, the device asking for reduced motion where `reduced` is set.
 */
const mounted = async (reduced: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener() {}, matches: reduced && query.includes('reduce'), removeEventListener() {}
  }))
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.resetModules()
  const { sky }                = await import('../../lib/state/sky.ts')
  const { default: TimeStrip } = await import('../../theme/TimeStrip.vue')
  return { sky, wrapper: mount(TimeStrip) }
}

it.each([
  ['runs the fast-forward from the live clock', 'live', false,
    'Run the rest of the hour at 60 times real speed', 'lapse'],
  ['returns from the fast-forward to now', 'running', false, 'Back to now', 'now'],
  ['returns from a held moment to now', 'held', false, 'Back to now', 'now'],
  ['moves a held frame five minutes on under reduced motion', 'held', true,
    'Draw the sky 5 minutes on', undefined]
] as const)('labels the round button as it %s', async (_, clock, reduced, label, mark) => {
  const { sky, wrapper } = await mounted(reduced)
  sky.clock.value        = clock
  await wrapper.vm.$nextTick()
  const button = wrapper.get('button')
  expect([button.attributes('aria-label'), button.get('svg').attributes('data-icon')]).toEqual([label, mark])
})
