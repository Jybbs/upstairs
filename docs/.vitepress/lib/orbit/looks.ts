/**
 * Reads what a spot sees of one satellite over the day after a catalog was
 * fetched, meaning every pass it makes, the look at each moment of a pass, and
 * how far a scan sampling that pass at a given spacing falls below its peak.
 */

import * as orbit                            from '../../../../rust/pkg/orbit.js'
import { TRACK_STEP, samplesFor, type Spot } from './scan.ts'

export interface Look { azimuth: number, elevation: number, time: number }

/**
 * A pass the scan traced, with its peak in degrees and its times as Unix times
 * in milliseconds.
 */
export interface Peaked { peak: number, peakAt: number, riseAt: number, setAt: number }

/**
 * The catalog number of the International Space Station.
 */
export const ISS       = 25544
/**
 * Seconds between the looks a pass is drawn from.
 */
export const LOOK_STEP = 5
/**
 * The elevation in degrees a pass climbs to before it counts as high.
 */
export const STEEP     = 30

/**
 * One pass and the looks around it, from one track sample before it rises to
 * one after it sets, with every time a Unix time in milliseconds and `curve`
 * holding the elevation at each second from `from`.
 */
export class Watched {
  constructor(
    readonly pass  : Peaked,
    readonly curve : Float64Array,
    readonly from  : number,
    readonly looks : Look[],
    readonly start : number
  ) {}

  /**
   * The time the curve ends, a Unix time in milliseconds.
   */
  get to() { return this.from + (this.curve.length - 1) * 1000 }

  /**
   * Returns the times of the samples above the horizon a scan taking one every
   * `step` seconds from `start` takes of the pass.
   */
  comb(step: number) {
    const every = step * 1000
    const first = this.start + Math.ceil((this.from - this.start) / every) * every
    const times = []
    for (let time = first; time <= this.to; time += every)
      if (this.elevationAt(time) >= 0) times.push(time)
    return times
  }

  /**
   * Returns the elevation at `time`, read linearly between the seconds of the
   * curve, or -90 outside it.
   */
  elevationAt(time: number) {
    const at = (time - this.from) / 1000
    if (at < 0 || at > this.curve.length - 1) return -90
    const index = Math.min(Math.floor(at), this.curve.length - 2)
    return this.curve[index] + (at - index) * (this.curve[index + 1] - this.curve[index])
  }

  /**
   * Returns the time of the highest sample a scan taking one every `step`
   * seconds takes.
   */
  highest(step: number) {
    const times   = this.comb(step)
    const heights = times.map(time => this.elevationAt(time))
    return times[heights.indexOf(Math.max(...heights))]
  }

  /**
   * Returns how far in degrees the highest sample of a scan taking one every
   * `step` seconds falls below the peak.
   */
  miss(step: number) { return this.pass.peak - this.elevationAt(this.highest(step)) }
}

/**
 * One satellite of a catalog seen from a spot through the day from `start`, a
 * Unix time in milliseconds.
 */
export class Watch {
  /**
   * Every pass the satellite makes in the day, leaving out a pass already up
   * at the start or still up at the end.
   */
  readonly passes: Peaked[]

  constructor(
    private readonly orbits : orbit.Orbits,
    private readonly row    : number,
    private readonly spot   : Spot,
    readonly start          : number
  ) {
    const samples = samplesFor(24 * 60, TRACK_STEP)
    const tracer  = new orbit.Tracer(spot.latitude, spot.longitude, start, samples, TRACK_STEP)
    const trace   = tracer.trace(orbits, [row])
    const passes  = trace.passes
    this.passes   = passes
      .filter(traced => !traced.earlier && !traced.later)
      .map(({ peak, peakAt, riseAt, setAt }) => ({
        peak   : peak,
        peakAt : start + peakAt * 1000,
        riseAt : start + riseAt * 1000,
        setAt  : start + setAt * 1000
      }))
    for (const traced of passes) traced.free()
    trace.free()
    tracer.free()
  }

  /**
   * The highest pass of the day, or `undefined` where the satellite makes none.
   */
  get highest(): Watched | undefined {
    const top = this.passes.reduce((best, pass) => pass.peak > best.peak ? pass : best, this.passes[0])
    return top && this.watched(top)
  }

  /**
   * The pass climbing to `STEEP` or higher whose highest `TRACK_STEP` sample
   * falls farthest below its peak, or the highest pass where none climbs that
   * far.
   */
  get scanned(): Watched | undefined {
    const steep = this.passes
      .filter(pass => pass.peak >= STEEP)
      .map(pass => this.watched(pass))
    if (!steep.length) return this.highest
    const misses = steep.map(pass => pass.miss(TRACK_STEP))
    return steep[misses.indexOf(Math.max(...misses))]
  }

  /**
   * Reads one pass, its elevation every second and its look every `LOOK_STEP`
   * seconds above the horizon.
   */
  watched(pass: Peaked): Watched {
    const from  = pass.riseAt - TRACK_STEP * 1000
    const to    = pass.setAt + TRACK_STEP * 1000
    const seen  = this.looks(from, to, LOOK_STEP)
    const looks = Array.from(seen.elevations, (elevation, index) => ({
      azimuth   : seen.azimuths[index],
      elevation : elevation,
      time      : from + index * LOOK_STEP * 1000
    }))
    const above = looks.filter(look => look.elevation >= 0)
    return new Watched(pass, this.looks(from, to, 1).elevations, from, above, this.start)
  }

  /**
   * Returns the elevation and azimuth the spot sees of the satellite from
   * `from` through `to`, `step` seconds apart.
   */
  private looks(from: number, to: number, step: number) {
    const samples = Math.floor((to - from) / 1000 / step) + 1
    const tracer  = new orbit.Tracer(this.spot.latitude, this.spot.longitude, from, samples, step)
    const looks   = tracer.looks(this.orbits, this.row)
    const { azimuths, elevations } = looks
    looks.free()
    tracer.free()
    return { azimuths, elevations }
  }
}
