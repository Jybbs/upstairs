import { TRACK_STEP, type Spot } from '../orbit/scan.ts'
import { seenAt }                from '../orbit/seen.ts'
import type { Tracks }           from '../state/tracks.ts'

/**
 * One moment of a pass's climb, `at` seconds into the window, with how high the
 * satellite stands in degrees and whether it can be seen by eye.
 */
interface Foothold { at: number, elevation: number, seen: boolean }

/**
 * Returns the climb of the pass at `index` from its rise to its set, cut at
 * the ends of a window `span` seconds long opening at Unix time `start`, read
 * at each of its track's samples and at its peak, where it stands at the peak
 * the scan found.
 */
export const climbOf = (index: number, span: number, spot: Spot, start: number, tracks: Tracks) => {
  const pass       = tracks.passes[index]
  const [from, to] = [Math.max(pass.riseAt, 0), Math.min(pass.setAt, span)]
  const moments    = new Set([from, to])
  for (let at = Math.ceil(from / TRACK_STEP) * TRACK_STEP; at < to; at += TRACK_STEP) moments.add(at)
  if (pass.peakAt > from && pass.peakAt < to) moments.add(pass.peakAt)
  return [...moments].toSorted((a, b) => a - b).map((at): Foothold => {
    const placed = tracks.at(index, at)
    return {
      at        : at,
      elevation : at === pass.peakAt ? pass.peak : placed ? Math.max(tracks.elevation, 0) : 0,
      seen      : placed && seenAt(tracks, pass.height, spot, start + at * 1000)
    }
  })
}

/**
 * Returns the paths of a climb drawn as a ridge, `x` placing a moment and `y`
 * an elevation: its outline closed along the ground, and its crest split into
 * the stretches where the satellite can be seen at both ends and the rest.
 */
export const ridgeOf = (climb: readonly Foothold[], x: (at: number) => number, y: (elevation: number) => number) => {
  const points = climb.map(({ at, elevation }) => `${x(at).toFixed(1)} ${y(elevation).toFixed(1)}`)
  const ground = y(0).toFixed(1)
  const crest  = { seen: '', unseen: '' }
  let last: keyof typeof crest | null = null
  for (let index = 1; index < climb.length; index++) {
    const kind   = climb[index - 1].seen && climb[index].seen ? 'seen' : 'unseen'
    crest[kind] += `${kind === last ? '' : `M${points[index - 1]}`}L${points[index]}`
    last         = kind
  }
  return {
    ...crest,
    outline : `M${x(climb[0].at).toFixed(1)} ${ground}L${points.join('L')}`
            + `L${x(climb.at(-1)!.at).toFixed(1)} ${ground}Z`
  }
}
