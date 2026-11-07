import {
  degreesToRadians, eciToEcf, eciToGeodetic, ecfToLookAngles, geodeticToEcf, gstime, json2satrec, propagate,
  type SatRec,
} from 'satellite.js'

import type { Record } from './catalog.ts'
import { kindOf, type Kind } from './kinds.ts'

/** Seconds between samples of the rough scan that finds what rises at all. */
export const GRID_STEP = 120
/** Seconds between samples of a track. */
export const TRACK_STEP = 30
/** Values stored per track sample: latitude, longitude, elevation. */
export const TRACK_WIDTH = 3

const DEGREES = 180 / Math.PI
const STATIONARY = 0.05

export interface Spot { latitude: number, longitude: number }

/**
 * One satellite's highest pass over a spot within a window, with its times in
 * seconds from the start of the window.
 */
export interface Pass {
  id      : number
  name    : string
  kind    : Kind
  peak    : number
  peakAt  : number
  riseAt  : number
  setAt   : number
  riseAz  : number
  setAz   : number
  heading : number | null
  height  : number
  range   : number
  earlier : boolean
  later   : boolean
}

export interface Satellite {
  id     : number
  name   : string
  kind   : Kind
  record : SatRec
}

export const observerOf = ({ latitude, longitude }: Spot) => ({
  latitude  : degreesToRadians(latitude),
  longitude : degreesToRadians(longitude),
  height    : 0,
})

/**
 * Reads a whole catalog into satellites the model can move.
 */
export const satellitesOf = (records: readonly Record[]): Satellite[] =>
  records.map(record => ({
    id     : record.NORAD_CAT_ID,
    name   : record.OBJECT_NAME,
    kind   : kindOf(record.OBJECT_NAME),
    record : json2satrec(record),
  }))

/**
 * Where one satellite stands at a moment, in Earth-fixed kilometers, or null when
 * the model cannot place it.
 */
const fixedAt = (record: SatRec, date: Date) => {
  const moved = propagate(record, date)
  if (!moved) return null
  return eciToEcf(moved.position, gstime(date))
}

export const samplesFor = (minutes: number, step: number): number => Math.floor(minutes * 60 / step) + 1

/**
 * Fills one satellite's slice of the grid with its Earth-fixed positions, NaN
 * where the model cannot place it.
 */
export const fillGrid = (grid: Float32Array, row: number, record: SatRec, start: number, samples: number): void => {
  const date = new Date(start)
  for (let sample = 0; sample < samples; sample++) {
    date.setTime(start + sample * GRID_STEP * 1000)
    const at   = fixedAt(record, date)
    const slot = (row * samples + sample) * 3
    grid[slot]     = at ? at.x : NaN
    grid[slot + 1] = at ? at.y : NaN
    grid[slot + 2] = at ? at.z : NaN
  }
}

/**
 * Reads a grid against a spot, counting what stands above the horizon at each
 * sample and listing which satellites rise at any sample.
 */
export const readGrid = (grid: Float32Array, rows: number, samples: number, spot: Spot) => {
  const observer = observerOf(spot)
  const site     = geodeticToEcf(observer)
  const cosLat   = Math.cos(observer.latitude)
  const upX      = cosLat * Math.cos(observer.longitude)
  const upY      = cosLat * Math.sin(observer.longitude)
  const upZ      = Math.sin(observer.latitude)
  const counts   = new Uint16Array(samples)
  const risen: number[] = []

  for (let row = 0; row < rows; row++) {
    let rises = false
    for (let sample = 0; sample < samples; sample++) {
      const slot = (row * samples + sample) * 3
      const dot  = (grid[slot] - site.x) * upX + (grid[slot + 1] - site.y) * upY + (grid[slot + 2] - site.z) * upZ
      if (dot > 0) { counts[sample]++; rises = true }
    }
    if (rises) risen.push(row)
  }
  return { counts, risen }
}

const bearing = (fromLat: number, fromLon: number, toLat: number, toLon: number): number => {
  const phi1 = fromLat / DEGREES, phi2 = toLat / DEGREES, delta = (toLon - fromLon) / DEGREES
  const angle = Math.atan2(Math.sin(delta) * Math.cos(phi2),
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(delta))
  return (angle * DEGREES + 360) % 360
}

/**
 * Traces one satellite through a window, writing its samples at `offset` of
 * `track`, and returns its highest pass over the spot, or null when it never
 * rises at a traced sample.
 */
export const traceInto = (
  track: Float32Array, offset: number, satellite: Satellite, spot: Spot, start: number, samples: number,
): Pass | null => {
  const observer = observerOf(spot)
  const azimuths = new Float32Array(samples)
  const heights  = new Float32Array(samples)
  const ranges   = new Float32Array(samples)
  const date     = new Date(start)
  let peak = -90, peakIndex = -1

  for (let sample = 0; sample < samples; sample++) {
    const slot = offset + sample * TRACK_WIDTH
    date.setTime(start + sample * TRACK_STEP * 1000)
    const moved = propagate(satellite.record, date)
    if (!moved) { track[slot] = track[slot + 1] = track[slot + 2] = NaN; continue }

    const gmst  = gstime(date)
    const point = eciToGeodetic(moved.position, gmst)
    const look  = ecfToLookAngles(observer, eciToEcf(moved.position, gmst))
    const elevation = look.elevation * DEGREES
    track[slot]     = point.latitude * DEGREES
    track[slot + 1] = point.longitude * DEGREES
    track[slot + 2] = elevation
    azimuths[sample] = look.azimuth * DEGREES
    heights[sample]  = point.height
    ranges[sample]   = look.rangeSat
    if (elevation > peak) { peak = elevation; peakIndex = sample }
  }
  if (peak <= 0) return null

  const elevationAt = (sample: number) => track[offset + sample * TRACK_WIDTH + 2]
  let rise = peakIndex, set = peakIndex
  while (rise > 0 && elevationAt(rise - 1) > 0) rise--
  while (set < samples - 1 && elevationAt(set + 1) > 0) set++

  const before = Math.max(peakIndex - 1, 0), after = Math.min(peakIndex + 1, samples - 1)
  const fromLat = track[offset + before * TRACK_WIDTH], fromLon = track[offset + before * TRACK_WIDTH + 1]
  const toLat   = track[offset + after * TRACK_WIDTH],  toLon   = track[offset + after * TRACK_WIDTH + 1]
  const moved   = Math.hypot(toLat - fromLat, ((toLon - fromLon + 540) % 360) - 180)

  return {
    id      : satellite.id,
    name    : satellite.name,
    kind    : satellite.kind,
    peak,
    peakAt  : peakIndex * TRACK_STEP,
    riseAt  : rise * TRACK_STEP,
    setAt   : set * TRACK_STEP,
    riseAz  : azimuths[rise],
    setAz   : azimuths[set],
    heading : moved < STATIONARY ? null : bearing(fromLat, fromLon, toLat, toLon),
    height  : heights[peakIndex],
    range   : ranges[peakIndex],
    earlier : rise === 0,
    later   : set === samples - 1,
  }
}
