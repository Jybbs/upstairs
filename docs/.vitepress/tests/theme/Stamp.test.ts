// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import Stamp from '../../theme/Stamp.vue'

vi.mock('../../lib/site/provenance.data.ts', () => import('../fixtures/provenance.ts'))
vi.mock('../../lib/state/sky.ts', () => ({
  sky: { loaded: { value: { count: 12345, fetched: Date.parse('2026-11-06T18:37:00Z') } } }
}))

it('opens the foot of the home page on the shield, beside the active count and the orbits time', () => {
  const footer = mount(Stamp).get('footer')
  expect(footer.element.firstElementChild?.matches('svg.shield')).toBe(true)
  expect(footer.findAll('dt').map(dt => dt.text())).toEqual(['Active', 'Orbits'])
})
