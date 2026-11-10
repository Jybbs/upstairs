import * as scan from '../orbit/scan.ts'

const DOCKED_DEGREES = 1
const DOCKED_KM      = 5
const DOCKED_SECONDS = 30

/**
 * Every traced pass of the current scan. The samples stay in the typed arrays
 * the worker sent, and reading one writes to fixed fields, so the drawing loop
 * makes no objects.
 */
export class Tracks {
  passes: scan.Pass[] = []
  samples             = 0
  latitude            = 0
  longitude           = 0
  elevation           = 0

  /**
   * Passes flown by a craft docked to an earlier pass, by index.
   */
  readonly docked = new Set<number>()
  /**
   * How many craft are docked to a pass, by catalog number.
   */
  readonly attached = new Map<number, number>()

  private buffers: Float32Array[] = []
  private offsets: number[]       = []

  clear() {
    this.passes  = []
    this.buffers = []
    this.offsets = []
    this.docked.clear()
    this.attached.clear()
  }

  /**
   * Returns the earlier crewed pass flying along with this one, as docked craft
   * do.
   */
  private hostOf(pass: scan.Pass): scan.Pass | undefined {
    if (pass.kind !== 'crewed') return undefined
    return this.passes.find((other, index) => other.kind === 'crewed'
      && !this.docked.has(index)
      && Math.abs(other.peakAt - pass.peakAt) <= DOCKED_SECONDS
      && Math.abs(other.peak - pass.peak) <= DOCKED_DEGREES
      && Math.abs(other.height - pass.height) <= DOCKED_KM)
  }

  add(passes: readonly scan.Pass[], track: Float32Array, samples: number) {
    this.samples = samples
    passes.forEach((pass, index) => {
      const host = this.hostOf(pass)
      if (host) {
        this.docked.add(this.passes.length)
        this.attached.set(host.id, (this.attached.get(host.id) ?? 0) + 1)
      }
      this.passes.push(pass)
      this.buffers.push(track)
      this.offsets.push(index * samples * scan.TRACK_WIDTH)
    })
  }

  /**
   * Reads sample `index` of a pass into the fields, returning false when the
   * model had no place for it.
   */
  sample(pass: number, index: number): boolean {
    const buffer   = this.buffers[pass]
    const slot     = this.offsets[pass] + index * scan.TRACK_WIDTH
    this.latitude  = buffer[slot]
    this.longitude = buffer[slot + 1]
    this.elevation = buffer[slot + 2]
    return !Number.isNaN(this.latitude)
  }

  /**
   * Reads a pass at `seconds` into the window, between its two nearest samples,
   * into the fields.
   */
  at(pass: number, seconds: number): boolean {
    const position = seconds / scan.TRACK_STEP
    const index    = Math.min(Math.floor(position), this.samples - 2)
    const buffer   = this.buffers[pass]
    const slot     = this.offsets[pass] + index * scan.TRACK_WIDTH
    const part     = position - index
    const fromLon  = buffer[slot + 1]
    let delta      = buffer[slot + scan.TRACK_WIDTH + 1] - fromLon
    if (delta > 180) delta -= 360
    else if (delta < -180) delta += 360
    this.latitude  = buffer[slot] + (buffer[slot + scan.TRACK_WIDTH] - buffer[slot]) * part
    this.longitude = fromLon + delta * part
    if (this.longitude > 180) this.longitude -= 360
    else if (this.longitude < -180) this.longitude += 360
    this.elevation = buffer[slot + 2] + (buffer[slot + scan.TRACK_WIDTH + 2] - buffer[slot + 2]) * part
    return !Number.isNaN(this.latitude + this.longitude)
  }
}
