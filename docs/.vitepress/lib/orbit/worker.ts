/**
 * Runs the pass scan off the page over one share of the catalog, holding the
 * share's propagators in the WebAssembly module, a new load dropping the share
 * held before. The worker asked to `load` downloads the catalog file and, as
 * each segment arrives, hands every helper on its ports the rows that fall to
 * it, keeps the first share, and posts every satellite of the segment, while a
 * helper asked to `follow` holds the rows its port hands it. Each scan posts
 * the share's counts and then its passes in batches, stops once a newer scan
 * arrives, and posts `untraced` where it throws.
 */

import init, * as orbit from '../../../../rust/pkg/orbit.js'
import * as catalog     from './catalog.ts'
import * as scan        from './scan.ts'

export type Answer =
  | { type: 'loaded', count: number, fetched: number, satellites: scan.Satellite[] }
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
  | { type: 'untraced', id: number }

export type Asked =
  | { type: 'load', url: string, helpers: MessagePort[] }
  | { type: 'follow', from: MessagePort }
  | { type: 'scan', id: number, spot: scan.Spot, start: number, minutes: number }

/**
 * The rows of one segment of the catalog that fall to a helper, beside the
 * count of every row loaded so far and the time the catalog was fetched.
 */
export interface Share {
  count   : number
  fetched : number
  records : catalog.Record[]
}

const BATCH                   = 100
const CHUNK                   = 400
const channel                 = new MessageChannel()
const ready                   = init()
const waiting: (() => void)[] = []

let held: { grid: orbit.Grid, key: string } | null = null
let latest                                         = 0
let orbits: orbit.Orbits | null                    = null
let satellites: scan.Satellite[]                   = []
let source: MessagePort | null                     = null

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
 * Drops the catalog and the grid held, stopping any scan under way.
 */
const drop = () => {
  latest = 0
  held?.grid.free()
  orbits?.free()
  source?.close()
  held       = null
  orbits     = null
  satellites = []
  source     = null
}

/**
 * Starts holding the rows a helper's port hands it, dropping what it held
 * before and posting the count of every row loaded once it holds each share.
 */
const follow = (from: MessagePort) => {
  drop()
  source         = from
  from.onmessage = async ({ data: { count, fetched, records } }: MessageEvent<Share>) => {
    await ready
    if (source !== from) return
    hold(records)
    post({ count, fetched, satellites: [], type: 'loaded' })
  }
}

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
 * Adds `records` to the propagators and satellites held, in order.
 */
const hold = (records: readonly catalog.Record[]) => {
  orbits ??= new orbit.Orbits()
  orbits.extend(records.map(record => record.EPOCH), catalog.elementsOf(records))
  satellites = [...satellites, ...scan.satellitesOf(records)]
}

/**
 * Downloads the catalog file at `url`, handing each port in `helpers` the
 * rows of each segment that fall to it, holding the first share, and posting
 * every satellite of the segment.
 */
const load = async (url: string, helpers: MessagePort[]) => {
  drop()
  try {
    const body = await catalog.bodyOf(url)
    await ready
    let count  = 0
    const size = helpers.length + 1
    for await (const { fetched, records } of catalog.segmentsOf(body)) {
      const first = count
      count      += records.length
      helpers.forEach((port, index) => port.postMessage(
        { count, fetched, records: shareOf(records, first, index + 1, size) } satisfies Share
      ))
      hold(shareOf(records, first, 0, size))
      post({ count, fetched, satellites: scan.satellitesOf(records), type: 'loaded' })
    }
  } catch (error) {
    post({ reason: String(error), type: 'failed' })
  }
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

/**
 * Returns the rows of a segment whose first row is row `first` of the catalog
 * that fall to share `index` of `size`, every `size`th row from the share's
 * own.
 */
const shareOf = <T>(rows: readonly T[], first: number, index: number, size: number) =>
  rows.filter((_, row) => (first + row) % size === index)

self.onmessage = async ({ data }: MessageEvent<Asked>) => {
  if (data.type === 'load') return load(data.url, data.helpers)
  if (data.type === 'follow') return follow(data.from)
  if (!orbits) return
  latest = data.id
  try {
    await run(orbits, data.id, data.minutes, data.spot, data.start)
  } catch {
    post({ id: data.id, type: 'untraced' })
  }
}
