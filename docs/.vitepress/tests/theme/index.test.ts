// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { type VNode }     from 'vue'

import MARK  from '../../lib/site/mark.json' with { type: 'json' }
import theme from '../../theme/index.ts'

type Slots = Record<'nav-bar-title-before' | 'not-found', () => VNode>

vi.mock('vitepress', () => ({ defineClientComponent: () => ({}) }))
vi.mock('vitepress/theme-without-fonts', () => ({ default: { Layout: {} } }))

const slotOf = (name: keyof Slots) => mount({ render: ((theme.Layout() as VNode).children as Slots)[name] })

it('sets the mark before the title of the navigation bar, named for the site', () => {
  const svg = slotOf('nav-bar-title-before').get('svg')
  expect(svg.attributes('aria-label')).toBe('Upstairs')
  expect(svg.attributes('viewBox')).toBe(MARK.s32.box)
  expect(svg.findAll('path').map(path => path.attributes('d'))).toEqual([MARK.capital, MARK.s32.d])
})

it('fills the not-found slot of the layout with the page sending a reader back to the map', () => {
  const wrapper = slotOf('not-found')
  expect(wrapper.get('h1').text()).toBe('Nothing is at this address.')
  expect(wrapper.get('a').attributes('href')).toBe('/')
})
