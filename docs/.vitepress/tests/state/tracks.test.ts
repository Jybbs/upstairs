import { describe, expect, it } from 'vitest'

import { type Pass, TRACK_WIDTH } from '../../lib/orbit/scan.ts'
import { Tracks }                 from '../../lib/state/tracks.ts'

const pass = (id: number, changes: Partial<Pass> = {}): Pass => ({
  earlier : false,
  heading : 170,
  height  : 410,
  id      : id,
  kind    : 'crewed',
  later   : false,
  name    : `CRAFT ${id}`,
  peak    : 60,
  peakAt  : 600,
  range   : 450,
  riseAt  : 300,
  riseAz  : 0,
  setAt   : 900,
  setAz   : 180,
  ...changes
})

describe('docked craft', () => {
  it('folds craft flying together into the first, and keeps a separate station apart', () => {
    const tracks = new Tracks()
    tracks.add([
      pass(1),
      pass(2, { height: 412, peak: 60.4 }),
      pass(3, { peak: 33, peakAt: 3000 }),
      pass(4, { kind: 'earth' })
    ], new Float32Array(16), 2)
    expect([...tracks.docked]).toEqual([1])
    expect(tracks.attached.get(1)).toBe(1)
  })
})

describe('reading a track', () => {
  it('interpolates across the antimeridian the short way', () => {
    const tracks = new Tracks()
    const track  = new Float32Array(2 * TRACK_WIDTH)
    track.set([0, 179, 10, 0, -179, 20])
    tracks.add([pass(1)], track, 2)
    expect(tracks.at(0, 15)).toBe(true)
    expect(Math.abs(tracks.longitude)).toBeCloseTo(180)
    expect(tracks.elevation).toBeCloseTo(15)
  })
})
