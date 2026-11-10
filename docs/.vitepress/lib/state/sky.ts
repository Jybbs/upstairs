import { computed, reactive, ref, shallowRef } from 'vue'

import * as kinds             from '../orbit/kinds.ts'
import type { Pass, Spot }    from '../orbit/scan.ts'
import type { Answer, Asked } from '../orbit/worker.ts'
import { Tracks }             from './tracks.ts'

export const HEIGHTS = [0, 30, 60, 80] as const
const HOME           = { place: 'Boston', spot: { latitude: 42.36, longitude: -71.06 } }
const NEARLY         = 80
const ROWS           = 200
export const SPEEDS  = [1, 60, 240] as const
export const WINDOWS = [30, 60, 120] as const
const WORTH          = 20

const highestOf = (list: Pass[]) =>
  list.reduce<Pass | null>((best, pass) => !best || pass.peak > best.peak ? pass : best, null)

const minuteOf = (time: number) => Math.floor(time / 60_000) * 60_000

const spotFromHash = (): Spot => {
  const [latitude, longitude] = location.hash.slice(1).split(',').map(Number)
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : HOME.spot
}

const tracedOf = () => {
  const entries = Object.entries(kinds.KINDS).map(([kind, { traced }]) => [kind, traced])
  return Object.fromEntries(entries) as Record<kinds.Kind, boolean>
}

/**
 * The one shared state of the page: the spot, the window, the clock, the
 * filters, and what the worker has found so far.
 */
class Sky {
  readonly tracks   = new Tracks()
  readonly spot     = shallowRef<Spot>(spotFromHash())
  readonly place    = ref<string | null>(location.hash ? null : HOME.place)
  readonly start    = ref(minuteOf(Date.now()))
  readonly minutes  = ref<number>(60)
  readonly speed    = ref<number>(60)
  readonly playing  = ref(!matchMedia('(prefers-reduced-motion: reduce)').matches)
  readonly traced   = reactive(tracedOf())
  readonly lowest   = ref<number>(0)
  readonly scope    = ref<'map' | 'sky'>('map')
  readonly selected = ref<number | null>(null)

  /**
   * Seconds into the window, read every frame, written to `at` a few times a
   * second.
   */
  seconds     = 0
  readonly at = ref(0)

  readonly loaded   = ref<{ count: number, fetched: string } | null>(null)
  readonly failed   = ref<string | null>(null)
  readonly done     = ref(false)
  readonly share    = ref(0)
  readonly version  = ref(0)
  readonly inFrame  = shallowRef<Uint8Array>(new Uint8Array())
  readonly up       = ref(0)
  readonly nearly   = ref(0)
  readonly starlink = ref(0)

  private counts: Uint16Array | null = null
  private countStep                  = 120
  private scanId                     = 0

  private worker = new Worker(new URL('../orbit/worker.ts', import.meta.url), { type: 'module' })

  /**
   * Returns whether the filters keep the pass at `index`, leaving out each
   * craft docked to another pass.
   */
  readonly traces = (index: number): boolean => {
    const pass = this.tracks.passes[index]
    return !this.tracks.docked.has(index) && this.traced[pass.kind] && pass.peak >= this.lowest.value
  }

  readonly rows = computed<{ list: Pass[], more: number }>(() => {
    void this.version.value
    const inFrame = this.inFrame.value
    const map     = this.scope.value === 'map'
    const list    = this.tracks.passes
      .filter((_, index) => this.traces(index) && (!map || inFrame[index] === 1))
      .sort((a, b) => a.peakAt - b.peakAt)
    return { list: list.slice(0, ROWS), more: Math.max(list.length - ROWS, 0) }
  })

  readonly focus = computed<Pass | null>(() => {
    void this.version.value
    return this.tracks.passes.find(pass => pass.id === this.selected.value) ?? null
  })

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<Answer>) => this.hear(data)
    this.ask({ type: 'load', url: `${import.meta.env.BASE_URL}catalog.json` })
  }

  private ask(asked: Asked) { this.worker.postMessage(asked) }

  private hear(answer: Answer) {
    if (answer.type === 'loaded') {
      this.loaded.value = { count: answer.count, fetched: answer.fetched }
      this.scan()
    } else if (answer.type === 'failed') {
      this.failed.value = answer.reason
    } else if (answer.id !== this.scanId) {
      return
    } else if (answer.type === 'counts') {
      this.counts    = answer.counts
      this.countStep = answer.step
      this.tally()
    } else if (answer.type === 'passes') {
      this.tracks.add(answer.passes, answer.track, answer.samples)
      this.share.value = answer.done / answer.total
      this.version.value++
    } else {
      this.done.value = true
      this.chooseFocus()
      this.version.value++
      this.tally()
    }
  }

  /**
   * Starts over for the current spot and window.
   */
  scan() {
    this.scanId++
    this.tracks.clear()
    this.done.value    = false
    this.share.value   = 0
    this.counts        = null
    this.inFrame.value = new Uint8Array()
    this.version.value++
    this.ask({
      id      : this.scanId,
      minutes : this.minutes.value,
      spot    : { ...this.spot.value },
      start   : this.start.value,
      type    : 'scan'
    })
  }

  /**
   * Keeps the chosen satellite when it is still found, and otherwise focuses on
   * a known mission crossing the sky, or else the highest satellite that
   * crosses.
   */
  private chooseFocus() {
    const passes = this.tracks.passes
    if (passes.some(pass => pass.id === this.selected.value)) return
    const crossing      = passes.filter(pass => this.traced[pass.kind] && !pass.earlier && !pass.later)
    const noted         = crossing.filter(pass => pass.id in kinds.NOTES && pass.peak >= WORTH)
    const best          = highestOf(noted) ?? highestOf(crossing) ?? highestOf(passes)
    this.selected.value = best?.id ?? null
  }

  pick(spot: Spot, place: string | null) {
    this.spot.value  = spot
    this.place.value = place
    history.replaceState(null, '', `#${spot.latitude.toFixed(3)},${spot.longitude.toFixed(3)}`)
    this.scan()
  }

  setWindow(minutes: number) {
    this.minutes.value = minutes
    this.seconds       = Math.min(this.seconds, minutes * 60)
    this.scan()
  }

  /**
   * Moves the window to begin at this minute.
   */
  toNow() {
    this.start.value = minuteOf(Date.now())
    this.seconds     = 0
    this.at.value    = 0
    this.scan()
  }

  /**
   * Selects a pass and moves the clock to its highest point.
   */
  focusOn(pass: Pass) {
    this.selected.value = pass.id
    this.seek(pass.peakAt)
  }

  seek(seconds: number) {
    this.seconds  = Math.max(Math.min(seconds, this.minutes.value * 60), 0)
    this.at.value = this.seconds
    this.tally()
  }

  /**
   * Moves the clock on by a frame's real time, starting the window over at its
   * end.
   */
  advance(realSeconds: number) {
    if (!this.playing.value) return
    this.seconds += realSeconds * this.speed.value
    if (this.seconds > this.minutes.value * 60) this.seconds = 0
  }

  /**
   * Counts what is up at the clock's time, reading the rough grid until the
   * traces finish.
   */
  tally() {
    this.at.value = this.seconds
    if (!this.done.value) {
      const counts = this.counts
      if (!counts) return
      const position = this.seconds / this.countStep
      const index    = Math.min(Math.floor(position), counts.length - 2)
      this.up.value  = Math.round(counts[index] + (counts[index + 1] - counts[index]) * (position - index))
      return
    }
    let up                    = 0
    let nearly                = 0
    let starlink              = 0
    const { seconds, tracks } = this
    for (let pass = 0; pass < tracks.passes.length; pass++) {
      if (!tracks.at(pass, seconds) || tracks.elevation <= 0) continue
      up++
      if (tracks.elevation >= NEARLY) nearly++
      if (tracks.passes[pass].kind === 'starlink') starlink++
    }
    this.up.value       = up
    this.nearly.value   = nearly
    this.starlink.value = starlink
  }

  /**
   * Returns the clock time of a moment in the window, in the viewer's own time
   * zone.
   */
  clockOf(seconds: number): string {
    const date = new Date(this.start.value + seconds * 1000)
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
}

export const sky = new Sky()
