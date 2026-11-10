import { type Catalog, recordsOf } from './catalog.ts'
import * as scan                   from './scan.ts'

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

export type Asked =
  | { type: 'load', url: string }
  | { type: 'scan', id: number, spot: scan.Spot, start: number, minutes: number }

const BATCH = 100
const CHUNK = 400

let satellites: scan.Satellite[] = []
let latest                       = 0
let held: { grid: Float32Array, key: string, samples: number } | null = null

const breathe = () => new Promise(resolve => setTimeout(resolve))

/**
 * Returns the rough grid of a window, kept between spots since a satellite's
 * positions do not depend on who is looking, or null when a newer scan has
 * taken over.
 */
const gridOf = async (id: number, start: number, minutes: number) => {
  const key = `${start}/${minutes}`
  if (held?.key === key) return held
  const samples = scan.samplesFor(minutes, scan.GRID_STEP)
  const grid    = new Float32Array(satellites.length * samples * 3)
  for (let row = 0; row < satellites.length; row++) {
    scan.fillGrid(grid, row, satellites[row].record, start, samples)
    if (row % CHUNK === 0) {
      await breathe()
      if (id !== latest) return null
    }
  }
  return held = { grid, key, samples }
}

const orderOf = (row: number) => Number(satellites[row].kind === 'starlink')

const post = (answer: Answer, transfer: Transferable[] = []) => self.postMessage(answer, { transfer })

const run = async (id: number, spot: scan.Spot, start: number, minutes: number) => {
  const held = await gridOf(id, start, minutes)
  if (!held) return
  const { counts, risen } = scan.readGrid(held.grid, satellites.length, held.samples, spot)
  post({ counts, id, step: scan.GRID_STEP, type: 'counts' })

  // Everything but Starlink comes first, since those rows are the ones that get read.
  const order   = [...risen].sort((a, b) => orderOf(a) - orderOf(b))
  const samples = scan.samplesFor(minutes, scan.TRACK_STEP)
  const width   = samples * scan.TRACK_WIDTH

  for (let first = 0; first < order.length; first += BATCH) {
    const batch               = order.slice(first, first + BATCH)
    const track               = new Float32Array(batch.length * width)
    const passes: scan.Pass[] = []
    for (const row of batch) {
      const pass = scan.traceInto(track, passes.length * width, satellites[row], spot, start, samples)
      if (pass) passes.push(pass)
    }
    post({
      done    : first + batch.length,
      id      : id,
      passes  : passes,
      samples : samples,
      total   : order.length,
      track   : track,
      type    : 'passes'
    }, [track.buffer])
    await breathe()
    if (id !== latest) return
  }
  post({ id, type: 'done' })
}

self.onmessage = async ({ data }: MessageEvent<Asked>) => {
  if (data.type === 'load') {
    try {
      const response = await fetch(data.url)
      if (!response.ok) throw new Error(`The catalog answered ${response.status}`)
      const catalog: Catalog = await response.json()
      satellites             = scan.satellitesOf(recordsOf(catalog))
      post({ count: satellites.length, fetched: catalog.fetched, type: 'loaded' })
    } catch (error) {
      post({ reason: String(error), type: 'failed' })
    }
    return
  }
  latest = data.id
  await run(data.id, data.spot, data.start, data.minutes)
}
