// @vitest-environment happy-dom
import { mount }                from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { CONTROLS, PARTS } from '../../../docs/.vitepress/lib/site/guide.ts'
import Locator             from '../../../docs/.vitepress/theme/Locator.tsx'

describe('the miniature of the first screen', () => {
  it.each(PARTS)('names the %s control in its label', part =>
    expect(mount(Locator, { props: { part } }).get('svg').attributes('aria-label'))
      .toBe(CONTROLS[part].caption))

  it.each([
    ['map', 1, 0],
    ['readout', 1, 0],
    ['spot', 2, 2],
    ['strip', 1, 0],
    ['list', 1, 0]
  ] as const)('raises the %s control alone', (part, raised, solid) => {
    const wrapper = mount(Locator, { props: { part } })
    expect([wrapper.findAll('.locator-raised').length, wrapper.findAll('.locator-solid').length])
      .toEqual([raised, solid])
  })
})
