import { computed, reactive, ref, shallowRef } from 'vue'

import type { Room }                      from '../map/numeral.ts'
import * as catalog                       from '../orbit/catalog.ts'
import * as kinds                         from '../orbit/kinds.ts'
import { minuteOf, type Pass, type Spot } from '../orbit/scan.ts'
import type { Answer, Asked }             from '../orbit/worker.ts'
import { clamp }                          from '../site/motion.ts'
import * as address                       from './address.ts'
import { Tracks }                         from './tracks.ts'

/**
 * What the clock does: follow the present, run the rest of the hour at
 * `CLOCK.lapse` times real speed, or hold where it was left.
 */
type Clock = 'held' | 'live' | 'running'

/**
 * What the readout shows, latched every `CLOCK.latch` milliseconds so it holds
 * still while it is read: how many satellites the map draws, how many stand
 * above the horizon, and each of the two by kind in the order of `KINDS`.
 */
interface Reading {
  above      : number
  aboveKinds : readonly number[]
  kinds      : readonly number[]
  onMap      : number
}

/**
 * The clock's tuning in seconds, except `lapse` as a multiple of real speed
 * and `latch` in milliseconds: how far into the window the present stands as
 * it opens, how far a press moves a held frame on under reduced motion, the
 * fast-forward's speed, and how long the readout holds a reading.
 */
export const CLOCK   = { ahead: 300, lapse: 60, latch: 30_000, lead: 300 } as const
export const HEIGHTS = [0, 30, 60, 80] as const
const MINUTES        = 60
const ROWS           = 200
const SPOKEN         = 20_000
const WORTH          = 20
const clockFormat    = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' })
const dayFormat      = new Intl.DateTimeFormat([], { day: 'numeric', month: 'short', weekday: 'short' })
const reduced        = matchMedia('(prefers-reduced-motion: reduce)').matches
/**
 * What the clock does at the present, holding still under reduced motion.
 */
const resting: Clock = reduced ? 'held' : 'live'
const shared         = address.spotIn(location.hash)
const opening        = shared ? { place: null, spot: shared } : address.HOME
/**
 * Writes a count of minutes as a figure beside the unit spelled out, as in `5
 * minutes`.
 */
export const minuteFormat = new Intl.NumberFormat([], { style: 'unit', unit: 'minute', unitDisplay: 'long' })
/**
 * The clock reading to the second while the fast-forward runs.
 */
export const secondFormat = new Intl.DateTimeFormat([], {
  hour   : 'numeric',
  minute : '2-digit',
  second : '2-digit'
})
const zeros               = kinds.kindOrder.map(() => 0)

const highestOf = (list: Pass[]) =>
  list.reduce<Pass | null>((best, pass) => !best || pass.peak > best.peak ? pass : best, null)

/**
 * Returns the time a window opens at for a present of `now`, `CLOCK.lead`
 * seconds before the present's minute.
 */
const openingOf = (now: number) => minuteOf(now) - CLOCK.lead * 1000

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
  readonly start    = ref(openingOf(Date.now()))
  /**
   * The length of the window in seconds.
   */
  readonly span     = MINUTES * 60
  /**
   * Whether the device asks for reduced motion, under which the clock holds
   * the frame it opened on.
   */
  readonly reduced  = reduced
  readonly clock    = ref(resting)
  readonly traced   = reactive(tracedOf())
  readonly lowest   = ref<number>(0)
  readonly scope    = ref<'map' | 'sky'>('map')
  readonly selected = shallowRef<Pass | null>(null)
  /**
   * The pass whose peak the pointer rests on in the strip, its track drawn on
   * the map until the pointer leaves.
   */
  readonly held     = shallowRef<Pass | null>(null)
  /**
   * The pass a press on its peak, its row, or its satellite pinned, which the
   * readout shows while the pointer rests on no other.
   */
  readonly pinned   = shallowRef<Pass | null>(null)
  /**
   * How many pixels of the map's foot a phone's sheet covers, which the map
   * frames a pinned pass above.
   */
  readonly covered  = ref(0)
  /**
   * Where the spot chooser stands: shut, open over the map, or landing while
   * the map flies to the spot it set.
   */
  readonly choosing = ref<'landing' | 'open' | 'shut'>('shut')
  /**
   * The spot under the chooser's pin, beside the town it stands on.
   */
  readonly aim      = shallowRef<{ place: string | null, spot: Spot } | null>(null)
  /**
   * How many pixels of the map's foot the chooser's sheet covers on a phone,
   * which the pin stands centered above.
   */
  readonly raised   = ref(0)
  /**
   * The room of the map the sky gathers into the numeral 404 over, while the
   * not-found page holds it gathered.
   */
  readonly gather   = shallowRef<Room | null>(null)
  /**
   * The kind the tally names, every other kind drawing dimmed while it is set.
   */
  readonly named    = ref<kinds.Kind | null>(null)

  /**
   * Seconds into the window, read every frame, written to `at` a few times a
   * second.
   */
  seconds     = this.present
  readonly at = ref(this.seconds)
  /**
   * Seconds into the window the present stood at as `at` was last written.
   */
  readonly now = ref(this.seconds)

  readonly loaded  = ref<{ count: number, fetched: number } | null>(null)
  readonly failed  = ref<string | null>(null)
  readonly done    = ref(false)
  readonly share   = ref(0)
  readonly version = ref(0)
  readonly inFrame = shallowRef<Uint8Array>(new Uint8Array())
  readonly up      = ref(0)
  readonly reading = shallowRef<Reading>({ above: 0, aboveKinds: zeros, kinds: zeros, onMap: 0 })
  /**
   * The count of what is up as a screen reader last announced it.
   */
  readonly spoken  = ref('')

  private aboveKinds                 = new Uint16Array(kinds.kindOrder.length)
  private counts: Uint16Array | null = null
  private countStep                  = 120
  private latchedAt                  = -Infinity
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
   * The catalog's age in days at the start of the window, and whether it is
   * too old to place anything.
   */
  readonly age     = computed(() => {
    const loaded = this.loaded.value
    return loaded ? catalog.ageOf(loaded.fetched, this.start.value) : 0
  })
  readonly expired = computed(() => this.age.value > catalog.AGES.limit)

  readonly focus = computed<Pass | null>(() => this.kept(this.selected.value))

  /**
   * The pass the readout shows, the one the pointer rests on before the one a
   * press pinned, while the scan still holds it.
   */
  readonly shown = computed<Pass | null>(() => this.kept(this.held.value ?? this.pinned.value))

  /**
   * Whole minutes from the present to the moment `at` reads, negative while
   * that moment is behind the present.
   */
  readonly away = computed(() => Math.floor(this.at.value / 60) - Math.floor(this.now.value / 60))

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<Answer>) => this.hear(data)
    this.ask({ type: 'load', url: `${import.meta.env.BASE_URL}${catalog.FILE}` })
  }

  /**
   * Seconds into the window the present stands at.
   */
  get present(): number { return (Date.now() - this.start.value) / 1000 }

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
      this.unlatch()
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
      minutes : MINUTES,
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

  /**
   * Opens the window `CLOCK.lead` seconds before the present's minute and
   * moves the clock to the present.
   */
  toNow() {
    this.start.value = openingOf(Date.now())
    this.back()
    this.scan()
  }

  /**
   * Returns the clock to the present, opening a new window once the present
   * has passed the end of this one.
   */
  back() {
    if (this.present >= this.span) return this.toNow()
    this.clock.value = resting
    this.moveClock(this.present)
  }

  /**
   * Answers a press of the round button. Under reduced motion it moves the
   * held frame `CLOCK.ahead` seconds on, and otherwise it runs the
   * fast-forward from the present and returns to the present from anywhere
   * else.
   */
  turn() {
    if (reduced) this.seek(this.seconds + CLOCK.ahead)
    else if (this.clock.value === 'live') this.clock.value = 'running'
    else this.back()
  }

  /**
   * Selects a pass and moves the clock to its highest point.
   */
  focusOn(pass: Pass) {
    this.pin(pass)
    this.seek(pass.peakAt)
  }

  /**
   * Chooses and pins `pass`, leaving the clock where it stands.
   */
  pin(pass: Pass) {
    this.selected.value = pass
    this.pinned.value   = pass
  }

  /**
   * Pins the listed pass peaking `by` places after the pinned one, or where
   * the list holds none pinned the nearest to peak that way from the time
   * read, and moves the clock to its peak.
   */
  step(by: 1 | -1) {
    const { list } = this.rows.value
    const index    = this.pinned.value ? list.indexOf(this.pinned.value) : -1
    const at       = this.at.value
    const next     = index >= 0 ? list[index + by]
      : by > 0 ? list.find(pass => pass.peakAt >= at) : list.findLast(pass => pass.peakAt < at)
    if (next) this.focusOn(next)
  }

  /**
   * Opens the spot chooser, its pin over the map where the spot stands.
   */
  choose() {
    this.aim.value      = { place: this.place.value, spot: this.spot.value }
    this.choosing.value = 'open'
  }

  /**
   * Moves to the spot under the chooser's pin, the chooser landing there
   * before it shuts.
   */
  land() {
    const aim = this.aim.value
    if (this.choosing.value !== 'open' || !aim) return
    this.pick(aim.spot, aim.place)
    this.choosing.value = 'landing'
  }

  /**
   * Shuts the open spot chooser, leaving the spot where it stood.
   */
  shut() {
    if (this.choosing.value === 'open') this.choosing.value = 'shut'
  }

  /**
   * Lets the pinned pass go, returning the readout to the count.
   */
  release() {
    this.held.value   = null
    this.pinned.value = null
  }

  /**
   * Holds the clock at a moment the reader chose.
   */
  seek(seconds: number) {
    this.clock.value = 'held'
    this.moveClock(seconds)
  }

  /**
   * Returns `pass` while the scan still holds it, and null otherwise.
   */
  private kept(pass: Pass | null) {
    void this.version.value
    return pass && this.tracks.passes.includes(pass) ? pass : null
  }

  private moveClock(seconds: number) {
    this.seconds = clamp(seconds, 0, this.span)
    this.unlatch()
    this.tally()
  }

  /**
   * Moves the clock on by a frame's real time, following the present while
   * live and holding at the window's end once the fast-forward reaches it,
   * where the next `latch` reads the frame it stopped on.
   */
  advance(realSeconds: number) {
    if (this.clock.value === 'live') this.seconds = Math.min(this.present, this.span)
    else if (this.clock.value === 'running') {
      this.seconds = Math.min(this.seconds + realSeconds * CLOCK.lapse, this.span)
      if (this.seconds < this.span) return
      this.clock.value = 'held'
      this.unlatch()
    }
  }

  /**
   * Moves a live window to the present once the present passes its end, and
   * otherwise counts what is up at the clock's time and announces the count.
   */
  tally() {
    if (this.clock.value === 'live' && this.present >= this.span) return this.toNow()
    this.at.value  = this.seconds
    this.now.value = this.present
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
    let up                                = 0
    const { aboveKinds, seconds, tracks } = this
    aboveKinds.fill(0)
    for (let pass = 0; pass < tracks.passes.length; pass++) {
      if (!tracks.up(pass, seconds)) continue
      up++
      aboveKinds[kinds.kindSlots[tracks.passes[pass].kind]]++
    }
    this.up.value = up
    return true
  }

  /**
   * Makes the next `latch` take a reading whatever its age.
   */
  unlatch() { this.latchedAt = -Infinity }

  /**
   * Takes a reading from what the map draws by kind, `onMap` in the order of
   * `KINDS`, on every call while the passes are traced or the fast-forward
   * runs, and otherwise once the last reading is `CLOCK.latch` milliseconds
   * old.
   */
  latch(onMap: Uint16Array) {
    const now = Date.now()
    if (this.done.value && this.clock.value !== 'running' && now - this.latchedAt < CLOCK.latch) return
    this.latchedAt     = now
    this.reading.value = {
      above      : this.up.value,
      aboveKinds : [...this.aboveKinds],
      kinds      : [...onMap],
      onMap      : onMap.reduce((sum, count) => sum + count, 0)
    }
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
   * Returns the clock time of a moment in the window in the viewer's own time
   * zone, written as `format` sets.
   */
  clockOf(seconds: number, format = clockFormat): string { return format.format(this.dateOf(seconds)) }

  /**
   * Returns the clock times of two moments in the window as one range, the
   * half of the day they share written once where both fall on one day.
   */
  rangeOf(from: number, to: number): string {
    const [start, end] = [this.dateOf(from), this.dateOf(to)]
    if (start.toDateString() === end.toDateString()) return clockFormat.formatRange(start, end)
    return `${clockFormat.format(start)} – ${clockFormat.format(end)}`
  }

  /**
   * Returns the date of a moment in the window in the viewer's own time zone,
   * written as `format` sets.
   */
  dayOf(seconds: number, format = dayFormat): string { return format.format(this.dateOf(seconds)) }

  /**
   * Returns whether a moment in the window falls on a later day than the
   * window opens on, in the viewer's own time zone.
   */
  laterDay(seconds: number): boolean {
    return this.dateOf(seconds).toDateString() !== this.dateOf(0).toDateString()
  }

  private dateOf(seconds: number): Date { return new Date(this.start.value + seconds * 1000) }
}

export const sky = new Sky()
