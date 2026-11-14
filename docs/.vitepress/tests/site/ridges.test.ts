import { describe, expect, it } from 'vitest'

import { TRACK_WIDTH }      from '../../lib/orbit/scan.ts'
import { climbOf, ridgeOf } from '../../lib/site/ridges.ts'
import { Tracks }           from '../../lib/state/tracks.ts'
import { passOf }           from '../fixtures/passes.ts'

/**
 * How high the satellite stands at each sample, 30 seconds apart, over the
 * spot on the equator at the prime meridian.
 */
const ELEVATIONS = [-10, -5, 0, 25, 50, 25, 0]
const SPOT       = { latitude: 0, longitude: 0 }
/**
 * A window opening 45 minutes after sunset at the March equinox, where a
 * satellite 400 km up stands in sunlight over a darkened spot.
 */
const START      = Date.parse('2026-03-20T18:45:00Z')

/**
 * Builds the tracks of one pass rising at 60 seconds, peaking at 50° at 120,
 * and setting at 180, its samples over the spot, with `changes` laid over it.
 */
const tracksOf = (changes = {}) => {
  const tracks = new Tracks()
  const track  = new Float32Array(ELEVATIONS.flatMap(elevation => [0, 0, elevation]))
  const pass   = passOf(1, { height: 400, peak: 50, peakAt: 120, riseAt: 60, setAt: 180, ...changes })
  tracks.add([pass], track, new Uint32Array([0]), track.length / TRACK_WIDTH)
  return tracks
}

describe('climbOf', () => {
  it.each([
    ['reads each sample from rise to set, standing at the peak the scan found', {}, 180,
      [[60, 0, false], [90, 25, true], [120, 50, true], [150, 25, true], [180, 0, false]]],
    ['adds the peak between two samples', { peak: 52, peakAt: 105 }, 180,
      [[60, 0, false], [90, 25, true], [105, 52, true], [120, 50, true], [150, 25, true], [180, 0, false]]],
    ['cuts the climb at the end of the window', {}, 120, [[60, 0, false], [90, 25, true], [120, 50, true]]],
    ['cuts the climb at the start of the window', { riseAt: -30 }, 90,
      [[0, 0, false], [30, 0, false], [60, 0, false], [90, 25, true]]]
  ] as const)('%s', (_, changes, span, expected) =>
    expect(climbOf(0, span, SPOT, START, tracksOf(changes)).map(({ at, elevation, seen }) => [at, elevation, seen]))
      .toEqual(expected))
})

describe('ridgeOf', () => {
  const ridge = ridgeOf(climbOf(0, 180, SPOT, START, tracksOf()), at => at, elevation => 100 - elevation)

  it.each([
    ['closes the outline along the ground', 'outline',
      'M60.0 100.0L60.0 100.0L90.0 75.0L120.0 50.0L150.0 75.0L180.0 100.0L180.0 100.0Z'],
    ['draws the crest seen at both ends of each stretch as one line', 'seen', 'M90.0 75.0L120.0 50.0L150.0 75.0'],
    ['draws every other stretch apart', 'unseen', 'M60.0 100.0L90.0 75.0M150.0 75.0L180.0 100.0']
  ] as const)('%s', (_, path, expected) => expect(ridge[path]).toBe(expected))
})
