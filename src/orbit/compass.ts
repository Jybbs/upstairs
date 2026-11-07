import type { Pass } from './scan.ts'

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const

export const pointOf = (degrees: number): string =>
  POINTS[Math.round(((degrees % 360) + 360) % 360 / 22.5) % POINTS.length]

/**
 * Whether a satellite runs north or south over the ground, or holds its place.
 */
export const boundOf = ({ heading }: Pick<Pass, 'heading'>): 'northbound' | 'southbound' | 'holding' => {
  if (heading === null) return 'holding'
  return Math.cos(heading * Math.PI / 180) >= 0 ? 'northbound' : 'southbound'
}

/**
 * Where a pass crosses the sky as seen from the spot, in compass points.
 */
export const crossingOf = ({ riseAz, setAz, earlier, later }: Pick<Pass, 'riseAz' | 'setAz' | 'earlier' | 'later'>): string => {
  if (earlier && later) return 'UP THROUGHOUT'
  return `${earlier ? 'ALREADY UP' : pointOf(riseAz)} → ${later ? 'STILL UP' : pointOf(setAz)}`
}
