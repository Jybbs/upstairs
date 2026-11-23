// @vitest-environment happy-dom
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, expect, it }    from 'vitest'

import { KINDS, kindOrder, type Kind } from '../../../docs/.vitepress/lib/orbit/kinds.ts'
import { fakeClock, framesOf }         from '../common/frames.ts'
import { passOf }                      from '../common/passes.ts'
import { addScanned, freshSky }        from '../common/sky.ts'

enableAutoUnmount(afterEach)

/**
 * A pass of each of three kinds traced from the start and of one left out,
 * peaking higher in turn.
 */
const PASSES = [
  passOf(1, { kind: 'crewed', peak: 10, peakAt: 400 }),
  passOf(2, { kind: 'science', peak: 45, peakAt: 500 }),
  passOf(3, { kind: 'earth', peak: 70, peakAt: 600 }),
  passOf(4, { kind: 'comms', peak: 85, peakAt: 700 })
]

/**
 * Mounts the filters over a fresh copy of the shared state holding `PASSES`,
 * every one but the second on the map, and returns `press`, which presses the
 * chip a text names and reads whether it is pressed, beside `shown`, which
 * reads the passes the list shows and whether each dot draws at full strength.
 */
const mounted = async () => {
  const { component: Filters, sky } = await freshSky(() =>
    import('../../../docs/.vitepress/theme/Filters.tsx'))
  addScanned(sky, PASSES)
  sky.inFrame.value = Uint8Array.of(1, 0, 1, 1)
  const wrapper     = mount(Filters)
  const chipOf      = (text: string) => wrapper.findAll('button').find(button => button.text() === text)!
  const press       = async (text: string) => {
    await chipOf(text).trigger('click')
    return chipOf(text).attributes('aria-pressed')
  }
  const shown       = () => ({
    listed : sky.rows.value.list.map(pass => pass.id),
    strong : PASSES.map((_, index) => sky.traces(index))
  })
  return { press, shown, sky }
}

it.each([
  ['lets the passes of a kind traced from the start go from the list and the address', 'crewed', 'false',
    { listed: [3], strong: [false, true, true, false] }, '#?kinds=science,earth,weather,navigation'],
  ['traces the passes of a kind left out from the start into the list and the address', 'comms', 'true',
    { listed: [1, 3, 4], strong: [true, true, true, true] },
    '#?kinds=crewed,science,earth,weather,navigation,comms']
] as const)('%s', async (_, kind: Kind, pressed, shown, written) => {
  const filters = await mounted()
  expect([await filters.press(KINDS[kind].label), filters.shown(), location.hash])
    .toEqual([pressed, shown, written])
})

it.each([
  [0, { listed: [1, 2, 3], strong: [true, true, true, false] }],
  [30, { listed: [2, 3], strong: [false, true, true, false] }],
  [60, { listed: [3], strong: [false, false, true, false] }],
  [80, { listed: [], strong: [false, false, false, false] }]
])('lists only the passes reaching %s° or more, the rest at half strength', async (height, shown) => {
  const filters = await mounted()
  await filters.press('In the sky')
  await filters.press('80°')
  expect([await filters.press(`${height}°`), filters.shown()]).toEqual(['true', shown])
})

it.each([
  ['lists the passes on the map alone', 'On this map', 'In the sky', [1, 3]],
  ['lists every pass in the sky, on the map or off it', 'In the sky', 'On this map', [1, 2, 3]]
])('%s', async (_, text, other, listed) => {
  const filters = await mounted()
  await filters.press(other)
  expect([await filters.press(text), filters.shown().listed]).toEqual(['true', listed])
})

it('folds the filters away under their heading and opens them again', async () => {
  const { component: Filters, sky } = await freshSky(() =>
    import('../../../docs/.vitepress/theme/Filters.tsx'))
  const wrapper                     = mount(Filters)
  const heading                     = wrapper.get('h2 button')
  const read                        = () => [heading.attributes('aria-expanded'),
    wrapper.get('[inert], h2 + div').attributes('inert') !== undefined]
  const opened = read()
  await heading.trigger('click')
  const folded = read()
  const named  = `Show me ${sky.showing.value.length} of ${kindOrder.length} kinds`
  expect([heading.text(), opened, folded]).toEqual([named, ['true', false], ['false', true]])
})

it.each([
  ['moves to the next kind on the right arrow', 0, 'ArrowRight', 1],
  ['moves to the kind before on the left arrow', 1, 'ArrowLeft', 0],
  ['moves to the last kind on End', 0, 'End', kindOrder.length - 1],
  ['moves to the first kind on Home', kindOrder.length - 1, 'Home', 0]
] as const)('%s, the kinds one tab stop between them', async (_, from, key, to) => {
  const { component: Filters } = await freshSky(() => import('../../../docs/.vitepress/theme/Filters.tsx'))
  const wrapper                = mount(Filters, { attachTo: document.body })
  const chips                  = wrapper.get('[role="group"]').findAll<HTMLButtonElement>('button')
  fakeClock()
  chips[from].element.focus()
  await chips[from].trigger('keydown', { key })
  await framesOf(1)
  expect([document.activeElement, chips.filter(chip => chip.attributes('tabindex') === '0').length])
    .toEqual([chips[to].element, 1])
})
