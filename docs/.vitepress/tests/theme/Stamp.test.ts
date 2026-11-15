// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { freshSky } from '../common/sky.ts'

vi.mock('../../lib/site/provenance.data.ts', () => import('../common/provenance.ts'))

const FETCHED = Date.parse('2026-11-06T18:53:57Z')

/**
 * Mounts the stamp over a fresh copy of the shared state, the catalog loaded
 * with `count` satellites where `count` is given, and returns its footer.
 */
const mounted = async (count?: number) => {
  const { component: Stamp, sky } = await freshSky(() => import('../../theme/Stamp.tsx'))
  if (count) sky.loaded.value = { count, fetched: FETCHED }
  return mount(Stamp).get('footer')
}

it.each([
  [
      'opens on the shield, then counts the satellites the catalog holds beside the day and time it was '
    + 'fetched, in UTC and en-US',
    12_345,
    ['12,345', new Intl.DateTimeFormat('en-US', {
      day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short', timeZone: 'UTC'
    }).format(FETCHED)]
  ],
  ['opens on the shield and holds no count and no time until the catalog loads', undefined, ['', '']]
])('%s', async (_, count, readings) => {
  const footer = await mounted(count)
  expect(footer.element.firstElementChild?.matches('svg.shield')).toBe(true)
  expect(footer.findAll('dt').map(dt => dt.text())).toEqual(['Active', 'Orbits'])
  expect(footer.findAll('dd').map(dd => dd.text())).toEqual(readings)
})
