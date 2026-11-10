import { segmentsOf } from './catalog.ts'
import type { Pass, Satellite, Spot } from './scan.ts'
import * as scan from './scan.ts'

export type Asked =
  | { type: 'load', url: string }
  | { type: 'scan', id: number, spot: Spot, start: number, minutes: number }

export type Answer =
  | { type: 'loaded', count: number, fetched: number }
  | { type: 'failed', reason: string }
  | { type: 'counts', id: number, counts: Uint16Array, step: number }
  | { type: 'passes', id: number, passes: Pass[], track: Float32Array, samples: number, done: number, total: number }
  | { type: 'done', id: number }

const CHUNK = 400
const BATCH = 100

let satellites: Satellite[] = []
let latest = 0
let held: { key: string, grid: Float32Array, samples: number } | null = null

const post = (answer: Answer, transfer: Transferable[] = []) => self.postMessage(answer, { transfer })
const breathe = () => new Promise(resolve => setTimeout(resolve))

/**
 * The rough grid of a window, kept between spots since a satellite's positions
 * do not depend on who is looking. Null when a newer scan has taken over.
 */
const gridOf = async (id: number, listed: Satellite[], start: number, minutes: number) => {
  const key = `${listed.length}/${start}/${minutes}`
  if (held?.key === key) return held
  const samples = scan.samplesFor(minutes, scan.GRID_STEP)
  const grid    = new Float32Array(listed.length * samples * 3)
  for (let row = 0; row < listed.length; row++) {
    scan.fillGrid(grid, row, listed[row].record, start, samples)
    if (row % CHUNK === 0) {
      await breathe()
      if (id !== latest) return null
    }
  }
  return held = { key, grid, samples }
}

const run = async (id: number, spot: Spot, start: number, minutes: number) => {
  const listed = satellites
  const held   = await gridOf(id, listed, start, minutes)
  if (!held) return
  const { counts, risen } = scan.readGrid(held.grid, listed.length, held.samples, spot)
  post({ type: 'counts', id, counts, step: scan.GRID_STEP })

  // Everything but Starlink comes first, since those rows are the ones that get read.
  const starlink = (row: number) => Number(listed[row].kind === 'starlink')
  const order    = [...risen].sort((a, b) => starlink(a) - starlink(b))
  const samples  = scan.samplesFor(minutes, scan.TRACK_STEP)
  const width    = samples * scan.TRACK_WIDTH

  for (let first = 0; first < order.length; first += BATCH) {
    const batch = order.slice(first, first + BATCH)
    const track = new Float32Array(batch.length * width)
    const passes: Pass[] = []
    for (const row of batch) {
      const pass = scan.traceInto(track, passes.length * width, listed[row], spot, start, samples)
      if (pass) passes.push(pass)
    }
    post({ type: 'passes', id, passes, track, samples, done: first + batch.length, total: order.length }, [track.buffer])
    await breathe()
    if (id !== latest) return
  }
  post({ type: 'done', id })
}

self.onmessage = async ({ data }: MessageEvent<Asked>) => {
  if (data.type === 'load') {
    try {
      const response = await fetch(data.url)
      if (!response.ok || !response.body) throw new Error(`The catalog answered ${response.status}`)
      for await (const { fetched, records } of segmentsOf(response.body)) {
        satellites = [...satellites, ...scan.satellitesOf(records)]
        post({ type: 'loaded', count: satellites.length, fetched })
      }
    } catch (error) {
      post({ type: 'failed', reason: String(error) })
    }
    return
  }
  latest = data.id
  await run(data.id, data.spot, data.start, data.minutes)
}
