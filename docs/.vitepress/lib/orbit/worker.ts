/**
 * Runs the pass scan off the page, holding the catalog's propagators in the
 * WebAssembly module and adding each segment of the catalog file as it
 * arrives. Each scan posts its counts and then its passes in batches, and
 * stops once a newer scan arrives.
 */

import init, * as orbit                   from '../../../../rust/pkg/orbit.js'
import { bodyOf, elementsOf, segmentsOf } from './catalog.ts'
import * as scan                          from './scan.ts'

export type Answer =
  | { type: 'loaded', count: number, fetched: number }
  | { type: 'failed', reason: string }
  | { type: 'counts', id: number, counts: Uint16Array, step: number }
  | {
      done    : number
      id      : number
      offsets : Uint32Array
      passes  : scan.Pass[]
      samples : number
      total   : number
      track   : Float32Array
      type    : 'passes'
    }
  | { type: 'done', id: number }

export type Asked =
  | { type: 'load', url: string }
  | { type: 'scan', id: number, spot: scan.Spot, start: number, minutes: number }

const BATCH                   = 100
const CHUNK                   = 400
const channel                 = new MessageChannel()
const ready                   = init()
const waiting: (() => void)[] = []

let held: { grid: orbit.Grid, key: string } | null = null
let latest                                         = 0
let orbits: orbit.Orbits | null                    = null
let satellites: scan.Satellite[]                   = []

channel.port1.onmessage = () => waiting.shift()?.()

/**
 * Yields to the worker's queue once, resolving each yield in the order it was
 * posted, so a scan a newer one replaced still resumes and frees what it holds.
 */
const breathe = () => new Promise<void>(resolve => {
  waiting.push(resolve)
  channel.port2.postMessage(null)
})

/**
 * The rough grid of a window over the records loaded so far, kept between
 * spots since a satellite's positions do not depend on who is looking. Null
 * when a newer scan has taken over.
 */
const gridOf = async (orbits: orbit.Orbits, id: number, minutes: number, start: number) => {
  const key = `${orbits.size}/${start}/${minutes}`
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
  const pass = scan.passOf(satellites[traced.row], traced)
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
  post({ counts, id, step: scan.GRID_STEP, type: 'counts' })

  const samples = scan.samplesFor(minutes, scan.TRACK_STEP)
  const tracer  = new orbit.Tracer(spot.latitude, spot.longitude, start, samples, scan.TRACK_STEP)

  try {
    // Rows run in catalog order, so every satellite but Starlink, whose segment comes last, is traced first.
    for (let first = 0; first < risen.length; first += BATCH) {
      const batch                      = risen.subarray(first, first + BATCH)
      const trace                      = tracer.trace(orbits, batch)
      const { offsets, passes, track } = trace
      trace.free()
      const done  = first + batch.length
      const total = risen.length
      post(
        { done, id, offsets, passes: passes.map(passOf), samples, total, track, type: 'passes' },
        [offsets.buffer, track.buffer]
      )
      await breathe()
      if (id !== latest) return
    }
    post({ id, type: 'done' })
  } finally {
    tracer.free()
  }
}

self.onmessage = async ({ data }: MessageEvent<Asked>) => {
  if (data.type === 'load') {
    try {
      const body = await bodyOf(data.url)
      await ready
      orbits = new orbit.Orbits()
      for await (const { fetched, records } of segmentsOf(body)) {
        orbits.extend(records.map(record => record.EPOCH), elementsOf(records))
        satellites = [...satellites, ...scan.satellitesOf(records)]
        post({ count: satellites.length, fetched, type: 'loaded' })
      }
    } catch (error) {
      post({ reason: String(error), type: 'failed' })
    }
    return
  }
  if (!orbits) return
  latest = data.id
  await run(orbits, data.id, data.minutes, data.spot, data.start)
}
