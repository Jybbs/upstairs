// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { kindOrder } from '../../lib/orbit/kinds.ts'

/**
 * Mounts the readout over a fresh copy of the shared state and a stand-in
 * worker, with the scan finished, a count announced, and the window opening at
 * 11:47 PM on Tuesday, November 10, 2026 in New York's time zone, read at
 * `seconds` into it, the device asking for reduced motion where `reduced`
 * is set.
 */
const mounted = async (seconds: number, reduced = false) => {
  vi.stubEnv('TZ', 'America/New_York')
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce') }))
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.resetModules()
  const { sky }              = await import('../../lib/state/sky.ts')
  const { default: Readout } = await import('../../theme/Readout.vue')
  sky.done.value   = true
  sky.spoken.value = '5 satellites above the horizon'
  sky.start.value  = new Date(2026, 10, 10, 23, 47).getTime()
  sky.at.value     = seconds
  return { sky, wrapper: mount(Readout) }
}

it('keeps the visible count silent and reads the spoken count from a polite region', async () => {
  const { wrapper } = await mounted(0)
  expect(wrapper.get('output').attributes('aria-live')).toBe('off')
  expect(wrapper.get('[aria-live="polite"]').text()).toBe('5 satellites above the horizon')
})

it.each([
  ['11:59 PM', 779, [], ''],
  ['12:00 AM', 780, ['Wed'], 'The time read is on Wednesday, November 11.']
])('names the weekday before the time at %s only once the day turns', async (time, at, weekday, spoken) => {
  const { wrapper } = await mounted(at)
  const line        = wrapper.get('p.truncate').text().replace(/\s+/g, ' ')
  expect(line).toBe(`Above Boston · ${[...weekday, time].join(' ')}`)
  expect(wrapper.findAll('[aria-live="polite"]')[1].text()).toBe(spoken)
})

it.each([
  ['live', 'Live'],
  ['running', '60× speed'],
  ['held', 'Paused']
] as const)('tags the %s clock beside the figure', async (clock, tag) => {
  const { sky, wrapper } = await mounted(0)
  sky.clock.value        = clock
  await wrapper.vm.$nextTick()
  expect(wrapper.get('output + span + span').text()).toBe(tag)
})

it('tags a held frame by how far it stands from the present, and draws the present on a press', async () => {
  const { sky, wrapper } = await mounted(0, true)
  sky.now.value          = 0
  sky.at.value           = 600
  await wrapper.vm.$nextTick()
  const tag = wrapper.get('button[aria-label]')
  expect([tag.text(), tag.attributes('aria-disabled')]).toEqual(['In 10 min', 'false'])
  const back = vi.spyOn(sky, 'back').mockImplementation(() => {})
  await tag.trigger('click')
  expect(back).toHaveBeenCalledOnce()
})

it('names the kind the tally holds on the last line, with how many the map draws of how many are up', async () => {
  const { sky, wrapper } = await mounted(0)
  sky.reading.value      = {
    above      : 9,
    aboveKinds : kindOrder.map(kind => kind === 'earth' ? 7 : 1),
    kinds      : kindOrder.map(kind => kind === 'earth' ? 5 : 0),
    onMap      : 5
  }
  await wrapper.vm.$nextTick()
  await wrapper.get('[aria-label="Earth, 5 on this map"]').trigger('click')
  expect(wrapper.findAll('p.caps').at(-1)!.text()).toBe('Earth · 5 of 7 up')
})

it('sets the figure to what the map draws and the last line to what stands above the horizon', async () => {
  const { sky, wrapper } = await mounted(0)
  sky.loaded.value       = { count: 9, fetched: sky.start.value }
  sky.up.value           = 12
  sky.reading.value      = { ...sky.reading.value, above: 9, onMap: 5 }
  await wrapper.vm.$nextTick()
  expect([wrapper.get('output').text(), wrapper.findAll('p.caps').at(-1)!.text()])
    .toEqual(['5', 'Of 9 above the horizon'])
})

it.each([
  ['live', '11:47 PM'],
  ['running', '11:47:30 PM']
] as const)('reads the %s clock as %s', async (clock, time) => {
  const { sky, wrapper } = await mounted(30)
  sky.clock.value        = clock
  await wrapper.vm.$nextTick()
  expect(wrapper.get('p.truncate').text().replace(/\s+/g, ' ')).toBe(`Above Boston · ${time}`)
})
