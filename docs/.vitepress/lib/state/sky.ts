import { computed, reactive, ref, shallowRef } from 'vue'

import * as catalog                       from '../orbit/catalog.ts'
import * as kinds                         from '../orbit/kinds.ts'
import { minuteOf, type Pass, type Spot } from '../orbit/scan.ts'
import type { Answer, Asked }             from '../orbit/worker.ts'
import * as address                       from './address.ts'
import { Tracks }                         from './tracks.ts'

export const HEIGHTS = [0, 30, 60, 80] as const
const NEARLY         = 80
const ROWS           = 200
const SPOKEN         = 20_000
export const SPEEDS  = [1, 60, 240] as const
export const WINDOWS = [30, 60, 120] as const
const WORTH          = 20
const clockFormat    = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' })
const dayFormat      = new Intl.DateTimeFormat([], { day: 'numeric', month: 'short', weekday: 'short' })
const shared         = address.spotIn(location.hash)
const opening        = shared ? { place: null, spot: shared } : address.HOME

const highestOf = (list: Pass[]) =>
  list.reduce<Pass | null>((best, pass) => !best || pass.peak > best.peak ? pass : best, null)

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
  readonly spot     = shallowRef<Spot>(opening.spot)
  readonly place    = ref<string | null>(opening.place)
  readonly start    = ref(minuteOf(Date.now()))
  readonly minutes  = ref<number>(60)
  readonly speed    = ref<number>(60)
  readonly playing  = ref(!matchMedia('(prefers-reduced-motion: reduce)').matches)
  readonly traced   = reactive(tracedOf())
  readonly lowest   = ref<number>(0)
  readonly scope    = ref<'map' | 'sky'>('map')
  readonly selected = shallowRef<Pass | null>(null)
  /**
   * The length of the window in seconds.
   */
  readonly span     = computed(() => this.minutes.value * 60)

  /**
   * Seconds into the window, read every frame, written to `at` a few times a
   * second.
   */
  seconds     = 0
  readonly at = ref(0)

  readonly loaded   = ref<{ count: number, fetched: number } | null>(null)
  readonly failed   = ref<string | null>(null)
  readonly done     = ref(false)
  readonly share    = ref(0)
  readonly version  = ref(0)
  readonly inFrame  = shallowRef<Uint8Array>(new Uint8Array())
  readonly up       = ref(0)
  readonly nearly   = ref(0)
  readonly starlink = ref(0)
  /**
   * The count of what is up as a screen reader last announced it.
   */
  readonly spoken   = ref('')

  private counts: Uint16Array | null = null
  private countStep                  = 120
  private scanId                     = 0
  private spokenAt                   = 0

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

  /**
   * The catalog's age in days at the start of the window, and what that age
   * allows.
   */
  readonly age       = computed(() => {
    const loaded = this.loaded.value
    return loaded ? catalog.ageOf(loaded.fetched, this.start.value) : 0
  })
  readonly freshness = computed(() => catalog.freshnessOf(this.age.value))
  readonly expired   = computed(() => this.freshness.value === 'expired')

  readonly focus = computed<Pass | null>(() => {
    void this.version.value
    const selected = this.selected.value
    return selected && this.tracks.passes.includes(selected) ? selected : null
  })

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<Answer>) => this.hear(data)
    this.ask({ type: 'load', url: `${import.meta.env.BASE_URL}${catalog.FILE}` })
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
      this.tracks.add(answer.passes, answer.track, answer.offsets, answer.samples)
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
   * Starts over for the current spot and window, placing nothing once the
   * catalog has expired.
   */
  scan() {
    this.scanId++
    this.tracks.clear()
    this.done.value    = false
    this.share.value   = 0
    this.counts        = null
    this.inFrame.value = new Uint8Array()
    this.version.value++
    if (this.expired.value) return
    this.ask({
      id      : this.scanId,
      minutes : this.minutes.value,
      spot    : { ...this.spot.value },
      start   : this.start.value,
      type    : 'scan'
    })
  }

  /**
   * Keeps the chosen pass when the scan found it again, or else the highest
   * pass of the chosen satellite, and otherwise focuses on a known mission
   * crossing the sky, or else the highest satellite that crosses.
   */
  private chooseFocus() {
    const passes        = this.tracks.passes
    const chosen        = this.selected.value
    const crossing      = passes.filter(pass => this.traced[pass.kind] && !pass.earlier && !pass.later)
    const noted         = crossing.filter(pass => pass.id in kinds.NOTES && pass.peak >= WORTH)
    this.selected.value = passes.find(pass => pass.key === chosen?.key)
      ?? highestOf(passes.filter(pass => pass.id === chosen?.id))
      ?? highestOf(noted)
      ?? highestOf(crossing)
      ?? highestOf(passes)
  }

  /**
   * Moves to a spot the reader chose, writing it into the page's address.
   */
  pick(spot: Spot, place: string | null) {
    this.moveTo(spot, place)
    history.replaceState(null, '', address.fragmentOf(spot))
  }

  /**
   * Moves to the spot the browser located, clearing the page's address of any
   * spot so a link copied from it carries none.
   */
  locate(spot: Spot) {
    this.moveTo(spot, 'your location')
    history.replaceState(null, '', location.pathname + location.search)
  }

  private moveTo(spot: Spot, place: string | null) {
    this.spot.value  = spot
    this.place.value = place
    this.scan()
  }

  setWindow(minutes: number) {
    this.minutes.value = minutes
    this.seconds       = Math.min(this.seconds, this.span.value)
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
    this.selected.value = pass
    this.seek(pass.peakAt)
  }

  seek(seconds: number) {
    this.seconds  = Math.max(Math.min(seconds, this.span.value), 0)
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
    if (this.seconds > this.span.value) this.seconds = 0
  }

  /**
   * Moves the window to the present once the present passes its end, and
   * otherwise counts what is up at the clock's time and announces the count.
   */
  tally() {
    if (Date.now() >= this.start.value + this.span.value * 1000) return this.toNow()
    this.at.value = this.seconds
    if (this.count()) this.speak()
  }

  /**
   * Counts what is up at the clock's time, reading the rough grid until the
   * traces finish, and returns false while the grid has not arrived.
   */
  private count(): boolean {
    if (!this.done.value) {
      const counts = this.counts
      if (!counts) return false
      const position = this.seconds / this.countStep
      const index    = Math.min(Math.floor(position), counts.length - 2)
      this.up.value  = Math.round(counts[index] + (counts[index + 1] - counts[index]) * (position - index))
      return true
    }
    let up                    = 0
    let nearly                = 0
    let starlink              = 0
    const { seconds, tracks } = this
    for (let pass = 0; pass < tracks.passes.length; pass++) {
      if (!tracks.up(pass, seconds)) continue
      up++
      if (tracks.elevation >= NEARLY) nearly++
      if (tracks.passes[pass].kind === 'starlink') starlink++
    }
    this.up.value       = up
    this.nearly.value   = nearly
    this.starlink.value = starlink
    return true
  }

  /**
   * Writes the count to `spoken` at most once every `SPOKEN` milliseconds.
   */
  private speak() {
    const now = Date.now()
    if (now - this.spokenAt < SPOKEN) return
    this.spokenAt     = now
    this.spoken.value = `${this.up.value.toLocaleString()} satellites above the horizon`
  }

  /**
   * Returns the clock time of a moment in the window, in the viewer's own time
   * zone.
   */
  clockOf(seconds: number): string { return clockFormat.format(this.dateOf(seconds)) }

  /**
   * Returns the date of a moment in the window in the viewer's own time zone,
   * written as `format` sets.
   */
  dayOf(seconds: number, format = dayFormat): string { return format.format(this.dateOf(seconds)) }

  /**
   * Returns whether a moment in the window falls on a later day than the window
   * opens on, in the viewer's own time zone.
   */
  laterDay(seconds: number): boolean {
    return this.dateOf(seconds).toDateString() !== this.dateOf(0).toDateString()
  }

  private dateOf(seconds: number): Date { return new Date(this.start.value + seconds * 1000) }
}

export const sky = new Sky()
