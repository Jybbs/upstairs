// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

/**
 * Mounts the readout over a fresh copy of the shared state and a stand-in
 * worker, with the scan finished, a count announced, and the window opening at
 * 11:47 PM on Tuesday, November 10, 2026, read at `seconds` into it.
 */
const mounted = async (seconds: number) => {
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.resetModules()
  const { sky }              = await import('../../lib/state/sky.ts')
  const { default: Readout } = await import('../../theme/Readout.vue')
  sky.done.value   = true
  sky.spoken.value = '5 satellites above the horizon'
  sky.start.value  = new Date(2026, 10, 10, 23, 47).getTime()
  sky.at.value     = seconds
  return mount(Readout)
}

it('keeps the visible count silent and reads the spoken count from a polite region', async () => {
  const wrapper = await mounted(0)
  expect(wrapper.get('output').attributes('aria-live')).toBe('off')
  expect(wrapper.get('[aria-live="polite"]').text()).toBe('5 satellites above the horizon')
})

it.each([
  ['11:58 PM', 660, [], ''],
  ['12:03 AM', 960, ['Wed'], 'The time read is on Wednesday, November 11.']
])('names the weekday before the time at %s only once the day turns', async (_, seconds, weekday, spoken) => {
  const wrapper = await mounted(seconds)
  expect(wrapper.findAll('p.truncate span').map(span => span.text())).toEqual(weekday)
  expect(wrapper.findAll('[aria-live="polite"]')[1].text()).toBe(spoken)
})
