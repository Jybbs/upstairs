import { expect, it } from 'vitest'

import { Overlay }     from '../../lib/map/overlay.ts'
import { TRACK_WIDTH } from '../../lib/orbit/scan.ts'
import { Tracks }      from '../../lib/state/tracks.ts'
import { passOf }      from '../fixtures/passes.ts'

const BOSTON = { latitude: 42.36, longitude: -71.06 }

/**
 * Builds a canvas whose 2D context ignores every call but `arc`, recording
 * the radius of each arc drawn while a line dash is set.
 */
const canvasOf = () => {
  const dashed: number[] = []
  const saved: number[]  = []
  let dash               = 0
  const calls            = {
    arc         : (_x: number, _y: number, radius: number) => dash && dashed.push(radius),
    canvas      : { height: 0, width: 0 },
    restore     : () => { dash = saved.pop() ?? 0 },
    save        : () => { saved.push(dash) },
    setLineDash : (segments: number[]) => { dash = segments.length }
  }
  const context = new Proxy<Record<string | symbol, unknown>>(calls, {
    get: (target, key) => target[key] ?? (() => {})
  })
  return { canvas: { getContext: () => context } as unknown as HTMLCanvasElement, dashed }
}

it.each([
  ['draws the ring 5 km out once 5 km spans 10 px', 7, true, true, 1],
  ['leaves the ring off while 5 km spans less than 10 px', 6, true, true, 0],
  ['leaves the ring off with nothing chosen', 7, false, true, 0],
  ['leaves the ring off where the chosen kind is filtered out', 7, true, false, 0]
])('%s', (_, zoom, chosen, traced, rings) => {
  const tracks = new Tracks()
  const pass   = passOf(25544, { riseAt: 0, setAt: 60 })
  const track  = new Float32Array(3 * TRACK_WIDTH)
  for (let sample = 0; sample < 3; sample++) {
    track.set([BOSTON.latitude, BOSTON.longitude, 45], sample * TRACK_WIDTH)
  }
  tracks.add([pass], track, Uint32Array.of(0), 3)
  const still   = canvasOf()
  const moving  = canvasOf()
  const overlay = new Overlay(still.canvas, moving.canvas, () => ({
    selected : chosen ? pass : null,
    spot     : BOSTON,
    traced   : () => traced,
    tracks   : tracks
  }))
  overlay.resize(400, 400, 1)
  overlay.view.set(400, 400, zoom, BOSTON.longitude, BOSTON.latitude)
  overlay.draw(30)
  expect(moving.dashed).toEqual(Array(rings).fill(expect.closeTo(5 * overlay.view.scale(BOSTON.latitude))))
})
