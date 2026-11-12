// @vitest-environment happy-dom
import { shallowMount } from '@vue/test-utils'
import { expect, it }   from 'vitest'

import type { Kind } from '../../lib/orbit/kinds.ts'
import Chip          from '../../theme/Chip.vue'

it.each<[string, { kind?: Kind, on: boolean }, (string | null)[]]>([
  ['marks a chip pressed and sets its kind’s icon in the panel’s color', { kind: 'crewed', on: true },
    ['true', 'var(--color-panel)']],
  ['marks a chip let go and leaves its kind’s icon in its own color', { kind: 'crewed', on: false },
    ['false', '']],
  ['sets no icon on a chip of no kind', { on: true }, ['true', null]]
])('%s', (_, props, shown) => {
  const wrapper = shallowMount(Chip, { props, slots: { default: 'Crewed' } })
  const icon    = wrapper.find<HTMLElement>('icon-stub')
  expect([wrapper.get('button').attributes('aria-pressed'), icon.exists() ? icon.element.style.color : null])
    .toEqual(shown)
})

it('sends a press for each click', async () => {
  const wrapper = shallowMount(Chip, { props: { on: false }, slots: { default: '30°' } })
  await wrapper.get('button').trigger('click')
  expect([wrapper.text(), wrapper.emitted('press')]).toEqual(['30°', [[]]])
})
