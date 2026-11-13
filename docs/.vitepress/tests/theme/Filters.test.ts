// @vitest-environment happy-dom
import { mount }      from '@vue/test-utils'
import { expect, it } from 'vitest'

import { KINDS, type Kind } from '../../lib/orbit/kinds.ts'
import { TRACK_WIDTH }      from '../../lib/orbit/scan.ts'
import { passOf }           from '../fixtures/passes.ts'
import { freshSky }         from '../fixtures/sky.ts'

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
  const { component: Filters, sky } = await freshSky(() => import('../../theme/Filters.vue'))
  sky.tracks.add(PASSES, new Float32Array(TRACK_WIDTH), new Uint32Array(PASSES.length), 1)
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
  ['lets the passes of a kind traced from the start go, their dots at half strength', 'crewed', 'false',
    { listed: [3], strong: [false, true, true, false] }],
  ['traces the passes of a kind left out from the start, their dots at full strength', 'comms', 'true',
    { listed: [1, 3, 4], strong: [true, true, true, true] }]
] as const)('%s', async (_, kind: Kind, pressed, shown) => {
  const filters = await mounted()
  expect([await filters.press(KINDS[kind].label), filters.shown()]).toEqual([pressed, shown])
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
