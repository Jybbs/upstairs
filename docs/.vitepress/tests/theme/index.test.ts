// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { type VNode }     from 'vue'

import theme from '../../theme/index.ts'

type Slots = { 'not-found': () => VNode }

vi.mock('vitepress', () => ({ defineClientComponent: () => ({}) }))
vi.mock('vitepress/theme-without-fonts', () => ({ default: { Layout: {} } }))

it('fills the not-found slot of the layout with the page sending a reader back to the map', () => {
  const slots   = (theme.Layout() as VNode).children as Slots
  const wrapper = mount({ render: slots['not-found'] })
  expect(wrapper.get('h1').text()).toBe('Nothing is at this address.')
  expect(wrapper.get('a').attributes('href')).toBe('/')
})
