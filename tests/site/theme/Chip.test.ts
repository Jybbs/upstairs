// @vitest-environment happy-dom
import { shallowMount } from '@vue/test-utils'
import { expect, it }   from 'vitest'

import type { Kind } from '../../../docs/.vitepress/lib/orbit/kinds.ts'
import Chip          from '../../../docs/.vitepress/theme/Chip.tsx'

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

it.each([
  ['names its choice in the chip', false, ['Crewed', false]],
  ['names its choice on a tip above the mark alone', true, ['Crewed', true]]
])('%s', (_, tip, shown) => {
  const wrapper = shallowMount(Chip, {
    props : { kind: 'crewed', on: false, tip },
    slots : { default: 'Crewed' }
  })
  const label   = wrapper.find('button > span')
  const shows   = label.exists() && ['group-hover:opacity-100', 'group-focus-visible:opacity-100']
    .every(reveal => label.classes(reveal))
  expect([wrapper.get('button').text(), shows]).toEqual(shown)
})

it('sends a press for each click', async () => {
  const wrapper = shallowMount(Chip, { props: { on: false }, slots: { default: '30°' } })
  await wrapper.get('button').trigger('click')
  await wrapper.get('button').trigger('click')
  expect([wrapper.text(), wrapper.emitted('press')]).toEqual(['30°', [[], []]])
})
