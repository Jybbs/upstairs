// @vitest-environment happy-dom
import { mount }      from '@vue/test-utils'
import { expect, it } from 'vitest'

import { freshSky } from '../fixtures/sky.ts'

/**
 * Mounts the stamp over a fresh copy of the shared state, the catalog loaded
 * with `count` satellites where `count` is given.
 */
const mounted = async (count?: number) => {
  const { component: Stamp, sky } = await freshSky(() => import('../../theme/Stamp.vue'))
  if (count) sky.loaded.value = { count, fetched: Date.parse('2026-11-06T18:53:57Z') }
  return mount(Stamp)
}

it.each([
  ['counts the satellites the catalog holds beside the day and time it was fetched', 12_345,
    /^12,345 active · Orbits Nov [67](,| at) \d{1,2}:\d{2}\s[AP]M$/],
  ['holds no count and no time until the catalog loads', undefined, /^active · Orbits$/]
])('%s', async (_, count, text) => expect((await mounted(count)).text()).toMatch(text))
