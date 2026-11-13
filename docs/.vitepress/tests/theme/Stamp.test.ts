// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { freshSky } from '../fixtures/sky.ts'

vi.mock('../../lib/site/provenance.data.ts', () => import('../fixtures/provenance.ts'))

/**
 * Mounts the stamp over a fresh copy of the shared state, the catalog loaded
 * with `count` satellites where `count` is given, and returns its footer.
 */
const mounted = async (count?: number) => {
  const { component: Stamp, sky } = await freshSky(() => import('../../theme/Stamp.vue'))
  if (count) sky.loaded.value = { count, fetched: Date.parse('2026-11-06T18:53:57Z') }
  return mount(Stamp).get('footer')
}

it.each([
  ['opens on the shield, then counts the satellites the catalog holds beside the day and time it was fetched',
    12_345, [/^12,345$/, /^Nov [67](,| at) \d{1,2}:\d{2}\s[AP]M$/]],
  ['opens on the shield and holds no count and no time until the catalog loads', undefined, [/^$/, /^$/]]
])('%s', async (_, count, readings) => {
  const footer = await mounted(count)
  expect(footer.element.firstElementChild?.matches('svg.shield')).toBe(true)
  expect(footer.findAll('dt').map(dt => dt.text())).toEqual(['Active', 'Orbits'])
  footer.findAll('dd').forEach((dd, i) => expect(dd.text()).toMatch(readings[i]!))
})
