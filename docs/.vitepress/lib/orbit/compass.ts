import type { Pass } from './scan.ts'

type Crossing = Pick<Pass, 'earlier' | 'later' | 'riseAz' | 'setAz'>

/**
 * The ways a satellite can move over the ground, each with the arrow and the
 * name the site shows for it.
 */
export const BOUNDS = {
  holding    : { arrow: '●', label: 'Holding its place' },
  northbound : { arrow: '▲', label: 'Northbound' },
  southbound : { arrow: '▼', label: 'Southbound' }
} as const
const POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
] as const

/**
 * Returns whether a satellite runs north or south over the ground, or holds its
 * place.
 */
export const boundOf = ({ heading }: Pick<Pass, 'heading'>): keyof typeof BOUNDS => {
  if (heading === null) return 'holding'
  return Math.cos(heading * Math.PI / 180) >= 0 ? 'northbound' : 'southbound'
}

/**
 * Returns where a pass crosses the sky as seen from the spot, in compass
 * points.
 */
export const crossingOf = ({ earlier, later, riseAz, setAz }: Crossing): string => {
  if (earlier && later) return 'UP THROUGHOUT'
  return `${earlier ? 'ALREADY UP' : pointOf(riseAz)} → ${later ? 'STILL UP' : pointOf(setAz)}`
}

export const pointOf = (degrees: number): string =>
  POINTS[Math.round(((degrees % 360) + 360) % 360 / 22.5) % POINTS.length]
