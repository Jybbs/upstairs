// @vitest-environment happy-dom
import { type VueWrapper, enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi }                 from 'vitest'

import { kindOrder, type Kind } from '../../lib/orbit/kinds.ts'
import { kindColor }            from '../../lib/site/palette.ts'
import { fakeClock, framesOf }  from '../common/frames.ts'
import { freshSky }             from '../common/sky.ts'

enableAutoUnmount(afterEach)

const COUNTS: Partial<Record<Kind, number>> = { crewed: 2, earth: 5 }

/**
 * Mounts the tally over a fresh copy of the shared state, reading `COUNTS` by
 * kind off the map, every kind it leaves out at zero.
 */
const mounted = async () => {
  const { component: Tally, sky } = await freshSky(() => import('../../theme/Tally.tsx'))
  const kinds                     = kindOrder.map(kind => COUNTS[kind] ?? 0)
  sky.reading.value               = { above: 0, aboveKinds: kinds, kinds, onMap: 0 }
  return { sky, wrapper: mount(Tally, { attachTo: document.body }) }
}

/**
 * Finds each row's bar, in the order the rows stand.
 */
const bars = (wrapper: VueWrapper) => wrapper.findAll<HTMLElement>('button > span:nth-of-type(2)')

/**
 * Reads the width of each row's bar, in the order the rows stand.
 */
const barsOf = (wrapper: VueWrapper) => bars(wrapper).map(bar => bar.element.style.width)

it('draws a row for each kind on the map and none for a kind with nothing up', async () => {
  const { wrapper } = await mounted()
  expect(wrapper.findAll('button').map(button => button.attributes('aria-label')))
    .toEqual(['Crewed, 2 on this map', 'Earth, 5 on this map'])
})

it('sets each row as its mark, its name, its bar, and its count', async () => {
  const { wrapper } = await mounted()
  expect(wrapper.findAll('button').map(row => [row.get('[data-icon]').attributes('data-icon'), row.text()]))
    .toEqual([['crewed', 'Crewed2'], ['earth', 'Earth5']])
})

it('draws every bar on one scale, the longest across its whole column', async () => {
  const { wrapper } = await mounted()
  expect(barsOf(wrapper)).toEqual(['40%', '100%'])
})

it('draws each bar solid in its kind’s color', async () => {
  const { wrapper } = await mounted()
  expect(bars(wrapper).map(bar => bar.element.style.background))
    .toEqual([kindColor('crewed'), kindColor('earth')])
})

it('keeps the bar of each kind on the map at least 2 px long', async () => {
  const { wrapper } = await mounted()
  expect(bars(wrapper).map(bar => bar.classes('min-w-0.5'))).toEqual([true, true])
})

it('draws an empty bar for the one row the keyboard keeps once no kind is on the map', async () => {
  const { sky, wrapper } = await mounted()
  const earth            = wrapper.findAll('button')[1]
  vi.spyOn(earth.element, 'matches').mockReturnValue(true)
  await earth.trigger('focus')
  sky.reading.value = { ...sky.reading.value, kinds: kindOrder.map(() => 0) }
  await wrapper.vm.$nextTick()
  const [bar] = bars(wrapper)
  expect([barsOf(wrapper), bar.classes('min-w-0.5')]).toEqual([['0%'], false])
})

it('switches a kind off at a press, naming none, and writes the kinds shown into the address', async () => {
  const { sky, wrapper } = await mounted()
  const [, earth]        = wrapper.findAll('button')
  expect(earth.attributes('aria-pressed')).toBe('true')
  await earth.trigger('click')
  expect([sky.traced.earth, earth.attributes('aria-pressed'), sky.named.value, location.hash])
    .toEqual([false, 'false', null, '#?kinds=crewed,science,weather,navigation'])
})

it('keeps a row the keyboard switched off, switching it back on at a second press', async () => {
  const { sky, wrapper } = await mounted()
  const earth            = wrapper.findAll('button')[1]
  vi.spyOn(earth.element, 'matches').mockReturnValue(true)
  await earth.trigger('focus')
  await earth.trigger('click')
  sky.reading.value = { ...sky.reading.value, kinds: kindOrder.map(kind => kind === 'crewed' ? 2 : 0) }
  await wrapper.vm.$nextTick()
  const kept = wrapper.findAll('button')[1]
  expect([kept.attributes('aria-label'), kept.attributes('aria-pressed'), barsOf(wrapper)])
    .toEqual(['Earth, 0 on this map', 'false', ['100%', '0%']])
  await kept.trigger('click')
  expect([sky.traced.earth, location.hash]).toEqual([true, ''])
})

it('lets the name of the kind the keyboard reached go on Escape', async () => {
  const { sky, wrapper } = await mounted()
  const earth            = wrapper.findAll('button')[1]
  vi.spyOn(earth.element, 'matches').mockReturnValue(true)
  await earth.trigger('focus')
  expect(sky.named.value).toBe('earth')
  await earth.trigger('keydown', { key: 'Escape' })
  expect(sky.named.value).toBe(null)
})

it('takes the tally out of the tab order once no kind is on the map', async () => {
  const { sky, wrapper } = await mounted()
  sky.reading.value      = { ...sky.reading.value, kinds: kindOrder.map(() => 0) }
  await wrapper.vm.$nextTick()
  expect([wrapper.findAll('button').length, wrapper.get('[role="group"]').attributes('tabindex')])
    .toEqual([0, '-1'])
})

it('dims every row but the one named', async () => {
  const { wrapper }     = await mounted()
  const [crewed, earth] = wrapper.findAll('button')
  await earth.trigger('pointerenter', { pointerType: 'mouse' })
  expect([crewed.classes('opacity-25'), earth.classes('opacity-25')]).toEqual([true, false])
})

it.each([
  ['keeps the row keyboard focus stands on, named, once none of its kind is on the map', true, 'earth', 2],
  ['lets a row a pointer focused leave the tally, unnamed, once none of its kind is on the map', false,
    null, 1]
])('%s', async (_, keyboard, named, rows) => {
  const { sky, wrapper } = await mounted()
  const earth            = wrapper.findAll('button')[1]
  vi.spyOn(earth.element, 'matches').mockReturnValue(keyboard)
  await earth.trigger('focus')
  expect(sky.named.value).toBe(named)
  sky.reading.value = { ...sky.reading.value, kinds: kindOrder.map(kind => kind === 'crewed' ? 2 : 0) }
  await wrapper.vm.$nextTick()
  expect([sky.named.value, wrapper.findAll('button').length]).toEqual([named, rows])
})

it.each([
  ['names the kind a mouse rests on and lets it go as the mouse leaves', 'mouse', 'earth'],
  ['leaves a touch to the tap rather than naming on contact', 'touch', null]
] as const)('%s', async (_, pointerType, named) => {
  const { sky, wrapper } = await mounted()
  const earth            = wrapper.findAll('button')[1]
  await earth.trigger('pointerenter', { pointerType })
  expect(sky.named.value).toBe(named)
  await earth.trigger('pointerleave', { pointerType })
  expect(sky.named.value).toBe(null)
})

it.each([
  ['moves to the next kind on the down arrow and names it', 0, 'ArrowDown', 1, 'earth'],
  ['moves to the kind before on the up arrow and names it', 1, 'ArrowUp', 0, 'crewed'],
  ['moves to the last kind on End and names it', 0, 'End', 1, 'earth'],
  ['moves to the first kind on Home and names it', 1, 'Home', 0, 'crewed']
] as const)('%s', async (_, from, key, to, named) => {
  const { sky, wrapper } = await mounted()
  const rows             = wrapper.findAll<HTMLButtonElement>('button')
  fakeClock()
  vi.spyOn(rows[to].element, 'matches').mockReturnValue(true)
  rows[from].element.focus()
  await rows[from].trigger('keydown', { key })
  await framesOf(1)
  expect([document.activeElement, sky.named.value]).toEqual([rows[to].element, named])
})
