import { describe, expect, it } from 'vitest'

import type { Pass } from '../src/orbit/scan.ts'
import { TRACK_WIDTH } from '../src/orbit/scan.ts'
import { Tracks } from '../src/state/tracks.ts'

const pass = (id: number, changes: Partial<Pass> = {}): Pass => ({
  id, name: `CRAFT ${id}`, kind: 'crewed', peak: 60, peakAt: 600, riseAt: 300, setAt: 900, riseAz: 0, setAz: 180,
  heading: 170, height: 410, range: 450, earlier: false, later: false, ...changes,
})

describe('docked craft', () => {
  it('folds craft flying together into the first, and keeps a separate station apart', () => {
    const tracks = new Tracks()
    tracks.add([pass(1), pass(2, { peak: 60.4, height: 412 }), pass(3, { peakAt: 3000, peak: 33 }), pass(4, { kind: 'earth' })], new Float32Array(16), 2)
    expect([...tracks.docked]).toEqual([1])
    expect(tracks.attached.get(1)).toBe(1)
  })
})

describe('reading a track', () => {
  it('interpolates across the antimeridian the short way', () => {
    const tracks = new Tracks()
    const track = new Float32Array(2 * TRACK_WIDTH)
    track.set([0, 179, 10, 0, -179, 20])
    tracks.add([pass(1)], track, 2)
    expect(tracks.at(0, 15)).toBe(true)
    expect(Math.abs(tracks.longitude)).toBeCloseTo(180)
    expect(tracks.elevation).toBeCloseTo(15)
  })
})
