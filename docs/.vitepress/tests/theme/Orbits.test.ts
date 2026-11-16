// @vitest-environment happy-dom
import { mount }      from '@vue/test-utils'
import { expect, it } from 'vitest'

import { type Standing, momentOf } from '../../lib/state/words.ts'
import Orbits                      from '../../theme/Orbits.tsx'

const TRACING: Standing = { above: 9, blank: false, count: 12, done: false, share: 0.5, stage: 'tracing' }

/**
 * Returns the classes each orbit's circles take, the catalog outermost, the
 * center dot left out.
 */
const strokesOf = (changes: Partial<Standing>) => mount(Orbits, {
  props: { moment: momentOf({ ...TRACING, ...changes }), size: 80 }
}).findAll('svg[viewBox="0 0 56 56"] > circle')
  .slice(0, -1)
  .map(circle => circle.classes()[0])

it.each([
  ['lights each step finished or under way while nothing has failed', {},
    ['stroke-u', 'stroke-rule', 'stroke-u', 'stroke-u']],
  ['leaves only the failed orbit lit, in ink, where the scan threw', { stage: 'untraced' },
    ['stroke-dim', 'stroke-ink', 'stroke-ink', 'stroke-dim']],
  ['dashes the orbit still waiting', { stage: 'fetching' },
    ['stroke-rule', 'stroke-u', 'stroke-dim', 'stroke-u']]
] as const)('%s', (_, changes, strokes) => expect(strokesOf(changes)).toEqual(strokes))

it('spins the catalog’s orbit while its size is unknown', () => {
  const wrapper = mount(Orbits, { props: { moment: momentOf({ ...TRACING, stage: 'fetching' }), size: 80 } })
  expect(wrapper.findAll('circle[class*="animate-"]')).toHaveLength(1)
})

it('names each step beside its reading, outermost first', () => {
  const wrapper = mount(Orbits, { props: { moment: momentOf(TRACING), size: 80 } })
  expect(wrapper.findAll('li').map(row => row.text()))
    .toEqual(['Catalog12 read', 'Passes50% traced', 'MapDrawn'])
})
