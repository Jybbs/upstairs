// @vitest-environment happy-dom
import { shallowMount }   from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { DAY }                  from '../../lib/orbit/catalog.ts'
import { KINDS, NOTES }         from '../../lib/orbit/kinds.ts'
import type { Pass }            from '../../lib/orbit/scan.ts'
import type { sky as Sky }      from '../../lib/state/sky.ts'
import { WORDS }                from '../../lib/state/words.ts'
import { passOf }               from '../common/passes.ts'
import { addScanned, freshSky } from '../common/sky.ts'

const FAILED = 'Error: The catalog answered 503'
const NOW    = Date.parse('2026-11-06T18:37:00Z')

/**
 * Mounts the focus panel over a fresh copy of the shared state, its icons and
 * names stubbed, with a catalog fetched now and `passes` in the scan, the first
 * of them chosen, after `set` has changed what else the state holds.
 */
const mounted = async (passes: Pass[], set: (sky: typeof Sky) => void = () => {}) => {
  vi.useFakeTimers({ now: NOW })
  const { component: Focus, sky } = await freshSky(() => import('../../theme/Focus.tsx'))
  sky.loaded.value                = { count: 1, fetched: NOW }
  addScanned(sky, passes)
  if (passes.length) sky.pin(passes[0])
  set(sky)
  const wrapper = shallowMount(Focus)
  vi.useRealTimers()
  return wrapper
}

it.each([
  ['says no satellite matches once the scan finishes with none chosen',
    (sky: typeof Sky) => { sky.done.value = true }, 'No satellite matches these filters'],
  ['says the orbits are too old to draw once the catalog has expired',
    (sky: typeof Sky) => { sky.loaded.value = { count: 1, fetched: NOW - 15 * DAY } },
    'The orbits are too old to draw']
])('%s', async (_, set, line) => expect((await mounted([], set)).text()).toBe(line))

it.each([
  ['leads with the catalog while it downloads', (sky: typeof Sky) => { sky.loaded.value = null },
    ['Catalog · Fetching', WORDS.fetching]],
  ['leads with the passes while the scan traces them', () => {},
    ['Passes · 0% traced', 'Tracing passes 0%']],
  ['explains a catalog that did not load', (sky: typeof Sky) => {
    sky.loaded.value = null
    sky.failed.value = FAILED
  }, ['Catalog · Did not load', 'No orbits arrived, so no pass over this spot can be traced']],
  ['explains a catalog that failed partway', (sky: typeof Sky) => {
    sky.loaded.value = { count: 7912, fetched: NOW }
    sky.failed.value = FAILED
  }, ['Catalog · 7,912 read', 'The download stopped after 7,912 orbits arrived']],
  ['explains a scan that threw', (sky: typeof Sky) => { sky.untraced.value = true },
    ['Passes · Stopped 0%', 'The trace over this spot stopped at 0%']]
])('%s', async (_, set, readings) => {
  const wrapper = await mounted([], set)
  expect([wrapper.get('p.caps').text(), wrapper.get('p.font-display').text()]).toEqual(readings)
})

it('explains a map that cannot draw in place of the pass it follows, over the way back', async () => {
  const wrapper = await mounted([passOf(25544)], sky => { sky.blank.value = true })
  expect(wrapper.findAll('p').map(line => line.text())).toEqual([
    'Map · No WebGL2',
    'This browser offers no WebGL2, which the map is drawn with',
    'Turning on hardware acceleration, or opening the page in a browser with WebGL2, draws it.'
  ])
})

it.each([
  ['describes a known mission by its note', [passOf(25544)], NOTES[25544]],
  ['describes any other satellite by what its kind is for', [passOf(7, { kind: 'weather' })],
    KINDS.weather.about],
  ['counts one craft docked to it as a craft or module', [passOf(25544), passOf(9)],
    `${NOTES[25544]} Flying with 1 docked craft or module.`],
  ['counts two craft docked to it as craft and modules', [passOf(25544), passOf(9), passOf(10)],
    `${NOTES[25544]} Flying with 2 docked craft and modules.`]
])('%s', async (_, passes, about) => expect((await mounted(passes)).findAll('p').at(-1)!.text()).toBe(about))

it('reads the chosen pass under its title, its heading, the sky it crosses, and its altitude', async () => {
  const wrapper = await mounted([passOf(25544, { height: 1234.6 })])
  expect([wrapper.get('h2').text(), ...wrapper.findAll('dd').slice(1).map(reading => reading.text())])
    .toEqual(['Watching No. 25544', 'Southbound, N → S', '1,235 km up'])
})
