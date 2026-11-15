import { describe, expect, it } from 'vitest'

import { DETENT, Detents } from '../../lib/map/detents.ts'

const FAR  = { latitude: 40, longitude: -70, zoom: 4 }
const NEAR = { latitude: 42, longitude: -71, zoom: 6 }

/**
 * Returns a set of detents holding the two steps.
 */
const detentsOf = () => {
  const detents = new Detents()
  detents.set([NEAR, FAR])
  return detents
}

it.each([
  ['zooms about the pointer between the steps', 5.2, 0.3, { zoom: 5.5 }],
  ['stops on the near step a turn crosses', 5.8, 0.4, { step: NEAR }],
  ['stops on the far step a turn crosses outward', 4.2, -0.4, { step: FAR }],
  ['stops on the first of two steps a long turn crosses inward', 3.5, 3, { step: FAR }],
  ['stops on the first of two steps a long turn crosses outward', 6.5, -3, { step: NEAR }]
])('%s', (_, zoom, delta, turned) => {
  const turn = detentsOf().turn(zoom, delta)
  expect(turn).toEqual('zoom' in turned ? { zoom: expect.closeTo(turned.zoom) } : turned)
})

it('holds at a step for half a zoom level of the wheel before going on', () => {
  const detents = detentsOf()
  detents.turn(5.8, 0.4)
  expect(detents.turn(NEAR.zoom, 0.3)).toBeNull()
  expect(detents.turn(NEAR.zoom, 0.3)).toEqual({ zoom: expect.closeTo(NEAR.zoom + 0.6 - DETENT.hold) })
})

it('lets go of the held step once Minus or Plus moves the camera', () => {
  const detents = detentsOf()
  detents.turn(5.8, 0.4)
  detents.next(NEAR.zoom, -1)
  expect(detents.turn(NEAR.zoom, 0.1)).toEqual({ zoom: expect.closeTo(6.1) })
})

it('draws the map toward the nearer of two steps within reach', () => {
  const detents = new Detents()
  detents.set([{ latitude: 0, longitude: 0, zoom: 6 }, { latitude: 0, longitude: 0, zoom: 7 }])
  expect(detents.pullAt(6.6)?.step.zoom).toBe(7)
})

it('zooms freely once no pass is chosen', () => {
  const detents = detentsOf()
  detents.turn(5.8, 0.4)
  detents.set([])
  expect(detents.turn(NEAR.zoom, 0.1)).toEqual({ zoom: expect.closeTo(6.1) })
})

it.each([
  ['draws the map wholly onto a step it stands at', NEAR.zoom, 1],
  ['draws the map a quarter of the way at half the reach', NEAR.zoom - DETENT.pull / 2, 0.25],
  ['leaves the map where it is past the reach', NEAR.zoom - DETENT.pull, null]
])('%s', (_, zoom, share) => {
  const pull = detentsOf().pullAt(zoom)
  expect(pull && pull.share).toEqual(share === null ? null : expect.closeTo(share))
})

describe('the zoom pair', () => {
  it.each([
    ['takes Plus to the far step', 5, 1, 6],
    ['takes Plus from between the steps to the near one', 7, 1, 9],
    ['takes Minus back to the near step', 10, -1, 9],
    ['takes Minus from between the steps to the far one', 7, -1, 6],
    ['finds no step for Plus past the near step', 9.5, 1, null]
  ] as const)('%s', (_, zoom, sign, step) => {
    const detents = new Detents()
    detents.set([{ latitude: 0, longitude: 0, zoom: 6 }, { latitude: 0, longitude: 0, zoom: 9 }])
    expect(detents.next(zoom, sign)?.zoom ?? null).toBe(step)
  })
})
