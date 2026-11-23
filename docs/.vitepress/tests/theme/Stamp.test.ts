// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import { freshSky } from '../common/sky.ts'

vi.mock('../../lib/site/provenance.data.ts', () => import('../common/provenance.ts'))

const FETCHED = Date.parse('2026-11-06T18:53:57Z')
const HOUR    = 3_600_000

afterEach(() => { vi.useRealTimers() })

/**
 * Mounts the stamp over a fresh copy of the shared state at `since`
 * milliseconds after the fetch, the catalog loaded with `count` satellites
 * where `count` is given, and returns its footer.
 */
const mounted = async (count?: number, since = 2 * HOUR) => {
  vi.useFakeTimers({ now: FETCHED + since, toFake: ['Date'] })
  const { component: Stamp, sky } = await freshSky(() => import('../../theme/Stamp.tsx'))
  if (count) sky.loaded.value = { count, fetched: FETCHED }
  return mount(Stamp).get('footer')
}

it.each([
  [
      'opens on the shield, then counts the satellites the catalog holds beside the day and time it was '
    + 'fetched and how long ago, in UTC and en-US',
    12_345,
    ['12,345', `${new Intl.DateTimeFormat('en-US', {
      day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short', timeZone: 'UTC'
    }).format(FETCHED)}, 2 hours ago`]
  ],
  ['opens on the shield and holds no count and no time until the catalog loads', undefined, ['', '']]
])('%s', async (_, count, readings) => {
  const footer = await mounted(count)
  expect(footer.element.firstElementChild?.matches('svg.shield')).toBe(true)
  expect(footer.findAll('dt').map(dt => dt.text())).toEqual(['Active', 'Orbits fetched'])
  expect(footer.findAll('dd').map(dd => dd.text())).toEqual(readings)
})

it.each([
  ['in whole minutes under an hour', 59 * 60_000, '59 minutes ago'],
  ['in whole hours under a day', 23.9 * HOUR, '23 hours ago'],
  ['in whole days from a day on', 50 * HOUR, '2 days ago']
])('says how long ago the orbits were fetched %s', async (_, since, ago) => {
  const footer = await mounted(16_904, since)
  expect(footer.findAll('dd')[1].text()).toMatch(new RegExp(`, ${ago}$`))
})
