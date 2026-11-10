/**
 * Runs the pass scan off the page, holding the catalog's propagators in the
 * WebAssembly module. Each scan posts its counts and then its passes in
 * batches, and stops once a newer scan arrives.
 */

import init, * as orbit            from '../../rust/pkg/orbit.js'
import { recordsOf, type Catalog } from './catalog.ts'
import * as scan                   from './scan.ts'

export type Asked =
  | { type: 'load', url: string }
  | { type: 'scan', id: number, spot: scan.Spot, start: number, minutes: number }

export type Answer =
  | { type: 'loaded', count: number, fetched: string }
  | { type: 'failed', reason: string }
  | { type: 'counts', id: number, counts: Uint16Array, step: number }
  | {
    done    : number
    id      : number
    passes  : scan.Pass[]
    samples : number
    total   : number
    track   : Float32Array
    type    : 'passes'
  }
  | { type: 'done', id: number }

const BATCH   = 100
const CHUNK   = 400
const channel = new MessageChannel()
const ready   = init()

let held: { grid: orbit.Grid, key: string } | null = null
let latest                                         = 0
let orbits: orbit.Orbits | null                    = null
let satellites: scan.Satellite[]                   = []

const breathe = () => new Promise(resolve => {
  channel.port1.onmessage = resolve
  channel.port2.postMessage(null)
})

/**
 * The rough grid of a window, kept between spots since a satellite's positions
 * do not depend on who is looking. Null when a newer scan has taken over.
 */
const gridOf = async (orbits: orbit.Orbits, id: number, minutes: number, start: number) => {
  const key = `${start}/${minutes}`
  if (held?.key === key) return held.grid
  held?.grid.free()
  held = null
  const grid = new orbit.Grid(orbits, start, scan.samplesFor(minutes, scan.GRID_STEP), scan.GRID_STEP)
  for (let row = 0; row < orbits.size; row += CHUNK) {
    grid.fill(orbits, row, row + CHUNK)
    await breathe()
    if (id !== latest) {
      grid.free()
      return null
    }
  }
  held = { grid, key }
  return grid
}

/**
 * Copies a traced pass out of the module's memory beside the satellite it
 * belongs to, freeing the copy the module holds.
 */
const passOf = (traced: orbit.Traced): scan.Pass => {
  const pass = {
    ...satellites[traced.row],
    earlier : traced.earlier,
    heading : traced.heading ?? null,
    height  : traced.height,
    later   : traced.later,
    peak    : traced.peak,
    peakAt  : traced.peakAt,
    range   : traced.range,
    riseAt  : traced.riseAt,
    riseAz  : traced.riseAz,
    setAt   : traced.setAt,
    setAz   : traced.setAz
  }
  traced.free()
  return pass
}

const post = (answer: Answer, transfer: Transferable[] = []) => self.postMessage(answer, { transfer })

const run = async (orbits: orbit.Orbits, id: number, minutes: number, spot: scan.Spot, start: number) => {
  const grid = await gridOf(orbits, id, minutes, start)
  if (!grid) return
  const sighting          = grid.sight(spot.latitude, spot.longitude)
  const { counts, risen } = sighting
  sighting.free()
  post({ type: 'counts', id, counts, step: scan.GRID_STEP })

  // Everything but Starlink comes first, since those rows are the ones that get read.
  const starlink = (row: number) => Number(satellites[row].kind === 'starlink')
  const order    = risen.toSorted((a, b) => starlink(a) - starlink(b))
  const samples  = scan.samplesFor(minutes, scan.TRACK_STEP)
  const tracer   = new orbit.Tracer(spot.latitude, spot.longitude, start, samples, scan.TRACK_STEP)

  try {
    for (let first = 0; first < order.length; first += BATCH) {
      const batch             = order.subarray(first, first + BATCH)
      const trace             = tracer.trace(orbits, batch)
      const { passes, track } = trace
      trace.free()
      const done  = first + batch.length
      const total = order.length
      post({ type: 'passes', done, id, passes: passes.map(passOf), samples, total, track }, [track.buffer])
      await breathe()
      if (id !== latest) return
    }
    post({ type: 'done', id })
  } finally {
    tracer.free()
  }
}

self.onmessage = async ({ data }: MessageEvent<Asked>) => {
  if (data.type === 'load') {
    try {
      const response = await fetch(data.url)
      if (!response.ok) throw new Error(`The catalog answered ${response.status}`)
      const text             = await response.text()
      const catalog: Catalog = JSON.parse(text)
      await ready
      orbits     = new orbit.Orbits(text)
      satellites = scan.satellitesOf(recordsOf(catalog))
      post({ type: 'loaded', count: satellites.length, fetched: catalog.fetched })
    } catch (error) {
      post({ type: 'failed', reason: String(error) })
    }
    return
  }
  if (!orbits) return
  latest = data.id
  await run(orbits, data.id, data.minutes, data.spot, data.start)
}
