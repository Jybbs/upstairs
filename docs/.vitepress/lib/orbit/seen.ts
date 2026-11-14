/**
 * Decides whether a satellite can be seen by eye from the spot, from where the
 * sun stands, whether Earth's shadow covers the satellite, and how high and how
 * far the satellite stands.
 */

import { EARTH_KM, slantOf } from './compass.ts'
import type { Spot }         from './scan.ts'

/**
 * Where a satellite stands, over the point at `latitude` and `longitude` and
 * `elevation` degrees over the spot's horizon.
 */
interface Look { elevation: number, latitude: number, longitude: number }

type Vector = [number, number, number]

/**
 * How far in degrees the sun stands under the spot's horizon at the least, how
 * high in degrees the satellite stands at the least, and how far in kilometers
 * it stands at the most, for a satellite in sunlight to be seen by eye.
 */
const SEEN = { dusk: 6, far: 5000, low: 10 } as const
/**
 * The equatorial radius of the WGS84 ellipsoid in kilometers and the square
 * of its eccentricity.
 */
const ELLIPSOID = { axis: 6378.137, eccentricity: 0.00669437999014 } as const
const RADIANS   = Math.PI / 180

const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * Returns the Earth-fixed position in kilometers of a point `height`
 * kilometers over the WGS84 ellipsoid at `latitude` and `longitude`.
 */
const fixedOf = (latitude: number, longitude: number, height: number): Vector => {
  const [sinLat, cosLat] = [Math.sin(latitude * RADIANS), Math.cos(latitude * RADIANS)]
  const [sinLon, cosLon] = [Math.sin(longitude * RADIANS), Math.cos(longitude * RADIANS)]
  const normal           = ELLIPSOID.axis / Math.sqrt(1 - ELLIPSOID.eccentricity * sinLat * sinLat)
  return [
    (normal + height) * cosLat * cosLon,
    (normal + height) * cosLat * sinLon,
    (normal * (1 - ELLIPSOID.eccentricity) + height) * sinLat
  ]
}

/**
 * Returns whether a satellite standing where `look` reads, `height` kilometers
 * up, can be seen by eye from the spot at Unix time `time` in milliseconds: in
 * sunlight outside the cylinder of Earth's shadow, while the sun stands
 * `SEEN.dusk` degrees or more under the spot's horizon and the satellite at
 * least `SEEN.low` degrees up and nearer than `SEEN.far` kilometers.
 */
export const seenAt = (
  { elevation, latitude, longitude } : Look,
  height                             : number,
  spot                               : Spot,
  time                               : number
): boolean => {
  if (elevation < SEEN.low || slantOf(height, elevation) >= SEEN.far) return false
  const sun = sunAt(time)
  const up  = fixedOf(spot.latitude, spot.longitude, 0)
  if (dot(up, sun) / Math.hypot(...up) > -Math.sin(SEEN.dusk * RADIANS)) return false
  const satellite = fixedOf(latitude, longitude, height)
  const toward    = dot(satellite, sun)
  return toward > 0 || dot(satellite, satellite) - toward * toward > EARTH_KM * EARTH_KM
}

/**
 * Returns the Earth-fixed unit vector toward the sun at Unix time `time` in
 * milliseconds, through the low-precision solar coordinates of the
 * Astronomical Almanac, good to about a minute of arc, turned by the mean
 * sidereal time at Greenwich.
 */
export const sunAt = (time: number): Vector => {
  const days      = time / 86_400_000 - 10_957.5
  const anomaly   = (357.529 + 0.98560028 * days) * RADIANS
  const mean      = 280.459 + 0.98564736 * days
  const along     = (mean + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RADIANS
  const tilt      = (23.439 - 0.00000036 * days) * RADIANS
  const turn      = (280.46061837 + 360.98564736629 * days) * RADIANS
  const [x, y, z] = [Math.cos(along), Math.cos(tilt) * Math.sin(along), Math.sin(tilt) * Math.sin(along)]
  return [x * Math.cos(turn) + y * Math.sin(turn), y * Math.cos(turn) - x * Math.sin(turn), z]
}
