import { describe, expect, it } from 'vitest'

import { type Pass, TRACK_WIDTH } from '../../lib/orbit/scan.ts'
import { Tracks }                 from '../../lib/state/tracks.ts'

const pass = (id: number, changes: Partial<Pass> = {}): Pass => ({
  earlier : false,
  heading : 170,
  height  : 410,
  id      : id,
  key     : `${id}/300`,
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
    const passes = [
      pass(1),
      pass(2, { height: 412, peak: 60.4 }),
      pass(3, { peak: 33, peakAt: 3000 }),
      pass(4, { kind: 'earth' })
    ]
    tracks.add(passes, new Float32Array(24), Uint32Array.of(0, 6, 12, 18), 2)
    expect([...tracks.docked]).toEqual([1])
    expect(tracks.attached.get(passes[0])).toBe(1)
    expect(tracks.attached.get(passes[2])).toBeUndefined()
  })
})

describe('reading a track', () => {
  it('interpolates across the antimeridian the short way', () => {
    const tracks = new Tracks()
    const track  = new Float32Array(2 * TRACK_WIDTH)
    track.set([0, 179, 10, 0, -179, 20])
    tracks.add([pass(1)], track, Uint32Array.of(0), 2)
    expect(tracks.at(0, 15)).toBe(true)
    expect(Math.abs(tracks.longitude)).toBeCloseTo(180)
    expect(tracks.elevation).toBeCloseTo(15)
  })

  it('reads two passes of one satellite from the samples they share', () => {
    const tracks = new Tracks()
    const track  = Float32Array.of(9, 9, 9, 9, 9, 9, 0, 0, 0, 1, 1, 1)
    tracks.add([pass(1), pass(1, { key: '1/0' })], track, Uint32Array.of(6, 6), 2)
    expect(tracks.sample(1, 1)).toBe(true)
    expect(tracks.latitude).toBe(1)
  })
})

describe('a satellite above the horizon', () => {
  it('leaves a pass out where it stands below the horizon inside its window', () => {
    const tracks = new Tracks()
    const track  = Float32Array.of(0, 0, -10, 0, 0, 10)
    tracks.add([pass(1, { riseAt: 0, setAt: 30 })], track, Uint32Array.of(0), 2)
    expect(tracks.up(0, 0)).toBe(false)
    expect(tracks.up(0, 30)).toBe(true)
  })

  const tracks = new Tracks()
  const track  = new Float32Array(121 * TRACK_WIDTH).fill(10)
  tracks.add(
    [pass(1, { riseAt: 0, setAt: 600 }), pass(1, { key: '1/1500', riseAt: 1500, setAt: 2100 })],
    track,
    Uint32Array.of(0, 0),
    121
  )

  it.each([[0, 0], [0, 629], [1, 1470], [1, 2129]])('places pass %i at %i seconds', (index, seconds) => {
    expect(tracks.up(index, seconds)).toBe(true)
  })

  it.each([[0, 630], [1, 629]])('leaves pass %i out at %i seconds, past its samples', (index, seconds) =>
    expect(tracks.up(index, seconds)).toBe(false))
})
