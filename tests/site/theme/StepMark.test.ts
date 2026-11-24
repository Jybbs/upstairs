// @vitest-environment happy-dom
import { mount }      from '@vue/test-utils'
import { expect, it } from 'vitest'

import type { Mark } from '../../../docs/.vitepress/lib/state/words.ts'
import StepMark      from '../../../docs/.vitepress/theme/StepMark.tsx'

it.each([
  ['fills a disc once the step is done', 'done', ['circle.fill-u']],
  ['draws an empty ring while the step waits', 'wait', ['circle.stroke-dim']],
  ['draws the share under way over a ring', 'now', ['circle.stroke-rule', 'circle.stroke-u']],
  ['strikes through a ring where the step failed', 'fail', ['circle.stroke-ink', 'path.stroke-ink']]
] as const)('%s', (_, mark: Mark, parts) => {
  const wrapper = mount(StepMark, { props: { step: { mark, reading: '' } } })
  expect(parts.map(part => wrapper.findAll(part).length)).toEqual(parts.map(() => 1))
})

it('draws at the size it is given', () => {
  const wrapper = mount(StepMark, { props: { size: 10, step: { mark: 'done', reading: '' } } })
  expect(wrapper.get('svg').attributes('width')).toBe('10')
})
