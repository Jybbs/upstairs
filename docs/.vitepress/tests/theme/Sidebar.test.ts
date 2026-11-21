// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { h }              from 'vue'

import { fakeClock, framesOf }  from '../common/frames.ts'
import { passOf }               from '../common/passes.ts'
import { addScanned, freshSky } from '../common/sky.ts'
import { stubMatchMedia }       from '../common/stubs.ts'

vi.mock('../../theme/Filters.tsx', async () => (await import('../common/stubs.ts')).stubOf('Filters'))
vi.mock('../../theme/Focus.tsx', async () => (await import('../common/stubs.ts')).stubOf('Focus'))
vi.mock('../../theme/PassList.tsx', async () => (await import('../common/stubs.ts')).stubOf('PassList'))

/**
 * Mounts the sidebar beside a stand-in map over a fresh copy of the shared
 * state holding three passes, the device asking for reduced motion where
 * `reduced` is set, and returns a reading of the rail and the sidebar.
 */
const mounted = async (reduced: boolean) => {
  stubMatchMedia(query => reduced && query.includes('reduce'))
  fakeClock()
  const { component: Sidebar, sky } = await freshSky(() => import('../../theme/Sidebar.tsx'))
  addScanned(sky, [1, 2, 3].map(id => passOf(id, { kind: 'weather', peakAt: 300 + id * 60 })))
  sky.scope.value = 'sky'
  const wrapper   = mount(Sidebar, { slots: { default: () => h('div', { 'data-map': '' }) } })
  const rail      = wrapper.get('button')
  const read      = () => ({
    drawn    : wrapper.find('aside').exists(),
    expanded : rail.attributes('aria-expanded'),
    label    : rail.attributes('aria-label'),
    map      : wrapper.find('[data-map]').exists()
  })
  return { rail, read, wrapper }
}

it('stands the card, the list, and the filters in order in the sidebar beside the map', async () => {
  const { wrapper } = await mounted(false)
  expect(wrapper.findAll('aside > div').map((block, index) =>
    block.findComponent({ name: ['Focus', 'PassList', 'Filters'][index] }).exists()))
    .toEqual([true, true, true])
})

it.each([
  ['folds the sidebar away once its blocks and its column have moved', false, 720],
  ['folds the sidebar away at once under reduced motion', true, 0]
])('%s', async (_, reduced, hold) => {
  const { rail, read } = await mounted(reduced)
  await rail.trigger('click')
  const folding = read()
  await vi.advanceTimersByTimeAsync(hold)
  expect([folding, read()]).toEqual([
    { drawn: true, expanded: 'false', label: 'Show the list of 3 passes', map: true },
    { drawn: false, expanded: 'false', label: 'Show the list of 3 passes', map: true }
  ])
})

it('opens the sidebar again on a second press, drawn closed and opened a frame later', async () => {
  const { rail, read } = await mounted(false)
  await rail.trigger('click')
  await vi.advanceTimersByTimeAsync(720)
  await rail.trigger('click')
  const drawn = read()
  await framesOf(2)
  expect([drawn, read()]).toEqual([
    { drawn: true, expanded: 'false', label: 'Show the list of 3 passes', map: true },
    { drawn: true, expanded: 'true', label: 'Fold the list away', map: true }
  ])
})
