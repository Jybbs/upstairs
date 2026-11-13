// @vitest-environment happy-dom
import { mount }                from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { Pass }           from '../../lib/orbit/scan.ts'
import type { sky as Sky }     from '../../lib/state/sky.ts'
import { passOf }              from '../fixtures/passes.ts'
import { addScanned, lateSky } from '../fixtures/sky.ts'

/**
 * Mounts the pass list over a fresh copy of the shared state and a stand-in
 * worker, with the window opening at 11:47 PM in New York's time zone, every
 * pass the scan holds listed whatever the map frames, and `passes` in the
 * scan, after `set` has changed what else the state holds.
 */
const mounted = async (passes: Pass[], set: (sky: typeof Sky) => void = () => {}) => {
  const { component: PassList, sky } = await lateSky(() => import('../../theme/PassList.vue'))
  addScanned(sky, passes)
  sky.scope.value = 'sky'
  set(sky)
  return { sky, wrapper: mount(PassList) }
}

/**
 * Builds `count` weather passes, a kind no craft docks to, each peaking a
 * minute after the one before it.
 */
const weatherOf = (count: number) =>
  Array.from({ length: count }, (_, id) => passOf(id, { kind: 'weather', peakAt: 300 + id * 60 }))

describe('the rows', () => {
  it('counts in the header every pass the list holds, the listed rows and those past them', async () => {
    const { wrapper } = await mounted(weatherOf(201))
    expect(wrapper.get('p > span').text()).toBe('201 passes')
  })

  it('reads each pass’s peak time, name, crossing, and highest elevation to a whole degree', async () => {
    const { wrapper }    = await mounted([passOf(7, { peak: 59.6 })])
    const [time, , peak] = wrapper.findAll('button > span')
    const [name, path]   = wrapper.findAll('button > span > span')
    expect([time, name, path, peak].map(found => found.text()))
      .toEqual(['11:57 PM', 'CRAFT 7', 'N → S', '60°'])
  })

  it.each([
    ['marks the chosen pass current', (sky: typeof Sky) => { sky.selected.value = sky.tracks.passes[0] },
      { current: 'true', faded: false, lifted: true }],
    ['fades a pass that has already set', (sky: typeof Sky) => { sky.at.value = 1000 },
      { current: 'false', faded: true, lifted: false }],
    ['leaves a pass unfaded at the moment it sets', (sky: typeof Sky) => { sky.at.value = 900 },
      { current: 'false', faded: false, lifted: false }]
  ])('%s', async (_, set, shown) => {
    const { wrapper } = await mounted([passOf(7)], set)
    const row         = wrapper.get('button')
    expect({
      current : row.attributes('aria-current'),
      faded   : row.classes('opacity-55'),
      lifted  : row.classes('bg-lift')
    }).toEqual(shown)
  })

  it('focuses the map on a pass whose row is clicked', async () => {
    const { sky, wrapper } = await mounted(weatherOf(2))
    const pass             = sky.tracks.passes[1]
    await wrapper.findAll('button')[1].trigger('click')
    expect([sky.selected.value, sky.pinned.value, sky.at.value]).toEqual([pass, pass, pass.peakAt])
  })
})

describe('the line beneath the list', () => {
  it.each([
    ['counts the passes past the listed rows', weatherOf(1200), false,
      ['And 1,000 more. Raise the height or zoom in to narrow the list.']],
    ['says no passes match once the scan has finished with an empty list', [], true,
      ['No passes match. Lower the height or trace another kind.']],
    ['shows nothing while a scan is still running over an empty list', [], false, []],
    ['shows nothing once a finished scan lists its passes', weatherOf(2), true, []]
  ])('%s', async (_, passes, done, lines) => {
    const { wrapper } = await mounted(passes, sky => { sky.done.value = done })
    expect(wrapper.findAll('section > p').slice(1).map(line => line.text())).toEqual(lines)
  })
})
