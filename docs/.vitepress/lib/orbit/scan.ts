/**
 * Declares the shape of a scan, meaning the spot it reads, the satellites and
 * passes it reports, and the steps its samples are taken at.
 */

import type { Record }       from './catalog.ts'
import { kindOf, type Kind } from './kinds.ts'

/**
 * One pass of a satellite over a spot within a window, with its times in
 * seconds from the start of the window and a key no other pass in the window
 * shares.
 */
export interface Pass extends Satellite {
  earlier : boolean
  heading : number | null
  height  : number
  key     : string
  later   : boolean
  peak    : number
  peakAt  : number
  range   : number
  riseAt  : number
  riseAz  : number
  setAt   : number
  setAz   : number
}

export interface Satellite {
  id   : number
  kind : Kind
  name : string
}

export interface Spot { latitude: number, longitude: number }

/**
 * A pass as the WebAssembly module traces it, before it is joined to its
 * satellite.
 */
export type Traced = Omit<Pass, keyof Satellite | 'heading' | 'key'> & { heading: number | undefined }

/**
 * Seconds between samples of the rough scan that finds what rises at all.
 */
export const GRID_STEP = 120
/**
 * Seconds between samples of a track.
 */
export const TRACK_STEP = 30
/**
 * Values stored per track sample: latitude, longitude, elevation.
 */
export const TRACK_WIDTH = 3

/**
 * Joins a pass the WebAssembly module traced to the satellite it belongs to,
 * reading a missing heading as one the satellite holds its place without.
 */
export const passOf = (satellite: Satellite, traced: Traced): Pass => ({
  ...satellite,
  earlier : traced.earlier,
  heading : traced.heading ?? null,
  height  : traced.height,
  key     : `${satellite.id}/${traced.riseAt}`,
  later   : traced.later,
  peak    : traced.peak,
  peakAt  : traced.peakAt,
  range   : traced.range,
  riseAt  : traced.riseAt,
  riseAz  : traced.riseAz,
  setAt   : traced.setAt,
  setAz   : traced.setAz
})

/**
 * Counts the samples a window of `minutes` takes at `step` seconds apart, both
 * ends included.
 */
export const samplesFor = (minutes: number, step: number): number => Math.floor(minutes * 60 / step) + 1

/**
 * Reads a whole catalog into the satellites a scan names, in the order of its
 * rows.
 */
export const satellitesOf = (records: readonly Record[]): Satellite[] =>
  records.map(({ NORAD_CAT_ID: id, OBJECT_NAME: name }) => ({ id, kind: kindOf(name), name }))
