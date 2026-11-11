// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

/**
 * Mounts the readout over the shared state and a stand-in worker, with the scan
 * finished, a count announced, and the window opening at 11:47 PM on Tuesday,
 * November 10, 2026 in New York's time zone, read at `seconds` into it.
 */
const mounted = async (seconds: number) => {
  vi.stubEnv('TZ', 'America/New_York')
  vi.stubGlobal('Worker', class { postMessage() {} })
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
  ['11:59 PM', 779, [], ''],
  ['12:00 AM', 780, ['Wed'], 'The time read is on Wednesday, November 11.']
])('names the weekday before the time at %s only once the day turns', async (time, at, weekday, spoken) => {
  const wrapper = await mounted(at)
  const line    = wrapper.get('p.truncate').text().replace(/\s+/g, ' ')
  expect(wrapper.findAll('p.truncate span').map(span => span.text())).toEqual(weekday)
  expect(line).toBe(`over Boston at ${[...weekday, time].join(' ')} your time`)
  expect(wrapper.findAll('[aria-live="polite"]')[1].text()).toBe(spoken)
})
