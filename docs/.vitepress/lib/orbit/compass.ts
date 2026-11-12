import type { Pass, Spot } from './scan.ts'

type Crossing = Pick<Pass, 'earlier' | 'later' | 'riseAz' | 'setAz'>

/**
 * The ways a satellite can move over the ground, each with the mark and the
 * name the site shows for it.
 */
export const BOUNDS = {
  holding    : { label: 'Holding its place', mark: null },
  northbound : { label: 'Northbound', mark: 'north' },
  southbound : { label: 'Southbound', mark: 'south' }
} as const
const EARTH_KM = 6371
const POINTS   = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
] as const

/**
 * Returns the compass bearing in degrees from the spot toward the point on the
 * ground at `latitude` and `longitude`, which on a round Earth is the azimuth
 * a satellite straight above that point stands at.
 */
export const bearingOf = ({ latitude: from, longitude }: Spot, latitude: number, toward: number) => {
  const a       = from * Math.PI / 180
  const b       = latitude * Math.PI / 180
  const delta   = (toward - longitude) * Math.PI / 180
  const degrees = Math.atan2(Math.sin(delta) * Math.cos(b),
    Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta)) * 180 / Math.PI
  return (degrees + 360) % 360
}

/**
 * Returns whether a satellite runs north or south over the ground, or holds
 * its place.
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

/**
 * Returns the distance in kilometers from the spot to a satellite `height`
 * kilometers up that stands `elevation` degrees above the horizon.
 */
export const slantOf = (height: number, elevation: number) => {
  const sine  = Math.sin(elevation * Math.PI / 180)
  const outer = EARTH_KM + height
  return Math.sqrt(outer * outer - EARTH_KM * EARTH_KM * (1 - sine * sine)) - EARTH_KM * sine
}

/**
 * Returns a spot's latitude and longitude to two decimals, each beside its
 * hemisphere.
 */
export const coordinatesOf = ({ latitude, longitude }: Spot) =>
  `${Math.abs(latitude).toFixed(2)}° ${latitude >= 0 ? 'N' : 'S'}, `
  + `${Math.abs(longitude).toFixed(2)}° ${longitude >= 0 ? 'E' : 'W'}`
