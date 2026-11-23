import { expect, it } from 'vitest'

import * as words from '../../../../docs/.vitepress/lib/state/words.ts'

/**
 * A scan a little over a third of the way through a whole catalog.
 */
const TRACING: words.Standing = {
  above : 2315,
  blank : false,
  count : 12384,
  done  : false,
  share : 0.37,
  stage : 'tracing'
}

/**
 * Reads the moment `changes` makes of `TRACING`.
 */
const momentOf = (changes: Partial<words.Standing>) => words.momentOf({ ...TRACING, ...changes })

it.each([
  ['the catalog downloads', { stage: 'fetching' }, ['now', 'wait', 'done'], 'catalog', null],
  ['the scan traces', {}, ['done', 'now', 'done'], 'passes', null],
  ['the scan finishes', { done: true, stage: 'traced' }, ['done', 'done', 'done'], 'passes', null],
  ['the catalog did not load', { stage: 'unloaded' }, ['fail', 'wait', 'done'], 'catalog', 'unloaded'],
  ['the catalog failed partway', { stage: 'partial' }, ['fail', 'now', 'done'], 'catalog', 'partial'],
  ['the scan threw', { stage: 'untraced' }, ['done', 'fail', 'done'], 'passes', 'untraced'],
  ['the map cannot draw', { blank: true, done: true, stage: 'traced' },
    ['done', 'done', 'fail'], 'map', 'blank'],
  ['the map cannot draw and the catalog did not load', { blank: true, stage: 'unloaded' },
    ['fail', 'wait', 'fail'], 'catalog', 'unloaded'],
  ['the map cannot draw and the scan threw', { blank: true, stage: 'untraced' },
    ['done', 'fail', 'fail'], 'passes', 'untraced']
] as const)('marks each step and leads with the one failing or under way where %s', (_, changes, ...rest) => {
  const moment = momentOf(changes)
  expect([words.STEPS.map(key => moment[key].mark), moment.lead, moment.failure]).toEqual(rest)
})

it.each([
  ['the scan traces', {}, ['12,384 read', '37% traced', 'Drawn']],
  ['the scan finishes', { done: true, stage: 'traced' }, ['12,384 read', '2,315 up', 'Drawn']],
  ['the scan threw', { stage: 'untraced' }, ['12,384 read', 'Stopped 37%', 'Drawn']],
  ['the map cannot draw', { blank: true, done: true, stage: 'traced' },
    ['12,384 read', '2,315 up', 'No WebGL2']]
] as const)('reads each step’s figure where %s', (_, changes, readings) => {
  const moment = momentOf(changes)
  expect(words.STEPS.map(key => moment[key].reading)).toEqual(readings)
})

it.each([
  ['the catalog did not load', 'unloaded', words.WORDS.unloaded, true],
  ['the catalog failed partway', 'partial', words.WORDS.partial, true],
  ['the scan threw', 'untraced', words.WORDS.untraced, false]
] as const)('names the failure and retries only where a load runs again, where %s', (_, stage, ...named) => {
  const moment = momentOf({ stage })
  expect([moment.line, moment.retry]).toEqual(named)
})

it('counts the orbits that arrived before the download stopped', () => {
  expect(momentOf({ stage: 'partial' }).note).toBe('The download stopped after 12,384 orbits arrived')
})

it('gives the share traced while the scan runs, with no way back to offer', () => {
  const moment = momentOf({})
  expect([moment.line, moment.next, moment.retry]).toEqual(['Tracing passes 37%', '', false])
})
