// @vitest-environment happy-dom
import { shallowMount }   from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { DAY }                    from '../../lib/orbit/catalog.ts'
import { KINDS, NOTES }           from '../../lib/orbit/kinds.ts'
import { TRACK_WIDTH, type Pass } from '../../lib/orbit/scan.ts'
import type { sky as Sky }        from '../../lib/state/sky.ts'
import { passOf }                 from '../fixtures/passes.ts'
import { freshSky }               from '../fixtures/sky.ts'

const NOW = Date.parse('2026-11-06T18:37:00Z')

/**
 * Mounts the focus panel over a fresh copy of the shared state, its icons and
 * names stubbed, with `passes` in the scan, the first of them chosen, after
 * `set` has changed what else the state holds.
 */
const mounted = async (passes: Pass[], set: (sky: typeof Sky) => void = () => {}) => {
  vi.useFakeTimers({ now: NOW })
  const { component: Focus, sky } = await freshSky(() => import('../../theme/Focus.vue'))
  sky.tracks.add(passes, new Float32Array(TRACK_WIDTH), new Uint32Array(passes.length), 1)
  if (passes.length) sky.pin(passes[0])
  set(sky)
  const wrapper = shallowMount(Focus)
  vi.useRealTimers()
  return wrapper
}

it.each([
  ['says the passes are being traced until the scan finishes', () => {}, 'Tracing passes'],
  ['says no satellite matches once the scan finishes with none chosen',
    (sky: typeof Sky) => { sky.done.value = true }, 'No satellite matches these filters'],
  ['says the orbits are too old to draw once the catalog has expired',
    (sky: typeof Sky) => { sky.loaded.value = { count: 1, fetched: NOW - 15 * DAY } },
    'The orbits are too old to draw']
])('%s', async (_, set, line) => expect((await mounted([], set)).text()).toBe(line))

it.each([
  ['describes a known mission by its note', [passOf(25544)], NOTES[25544]],
  ['describes any other satellite by what its kind is for', [passOf(7, { kind: 'weather' })],
    KINDS.weather.about],
  ['counts one craft docked to it as a craft or module', [passOf(25544), passOf(9)],
    `${NOTES[25544]} Flying with 1 docked craft or module.`],
  ['counts two craft docked to it as craft and modules', [passOf(25544), passOf(9), passOf(10)],
    `${NOTES[25544]} Flying with 2 docked craft and modules.`]
])('%s', async (_, passes, about) => expect((await mounted(passes)).findAll('p').at(-1)!.text()).toBe(about))

it('reads the chosen pass’s heading, the sky it crosses, and its altitude', async () => {
  const wrapper = await mounted([passOf(25544, { height: 1234.6 })])
  expect([wrapper.findAll('p')[1].text(), ...wrapper.findAll('dd').slice(1).map(reading => reading.text())])
    .toEqual(['Southbound', 'N → S', '1,235 km'])
})
