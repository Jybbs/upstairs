import { AGES, ageOf }                      from '../orbit/catalog.ts'
import { slantOf }                          from '../orbit/compass.ts'
import { kindOrder, kindSlots, type Kind }  from '../orbit/kinds.ts'
import { TRACK_STEP, type Pass, type Spot } from '../orbit/scan.ts'
import { GRID, iconOf }                     from '../site/icons.ts'
import { clamp }                            from '../site/motion.ts'
import { SCHEMES, type Scheme }             from '../site/palette.ts'
import type { Tracks }                      from '../state/tracks.ts'
import { View }                             from './mercator.ts'

interface Drawn {
  gathered : boolean
  held     : Pass | null
  named    : Kind | null
  reduced  : boolean
  selected : Pass | null
  spot     : Spot
  start    : number
  traced   : (pass: number) => boolean
  tracks   : Tracks
}

export interface Label {
  latitude  : number
  longitude : number
  name      : string
  tier      : 'region' | 'city' | 'water'
}

/**
 * The beads behind each dot: about `gap` pixels apart, laid at an interval
 * doubling from `step` seconds of the window up to `most`, fading over the
 * last `count`, each `size` times its dot's radius at `ink` of its alpha.
 */
export const BEADS = { count: 5, gap: 9, ink: 0.7, most: 640, size: 0.6, step: 2 } as const
const BOOK        = '"Newsreader Variable", serif'
/**
 * The share of its own alpha each kind draws at while the tally names another.
 */
const DIM         = 0.16
/**
 * Each dot: how many seconds it takes to fade in as it rises and out as it
 * sets, the width of its halo, the stroke of its open ring, how far it dims
 * once open, and how far past its edge the ring round the held and chosen
 * dots stands.
 */
const DOT         = { ends: 40, halo: 1.5, held: 3.5, open: 0.3, thin: 1.2 } as const
const DOT_GAP     = 4.5
/**
 * The kind's mark beside the satellite the readout holds: its size in pixels,
 * the radius of the halo under it, and how far its center stands from the dot
 * along each axis.
 */
const BADGE       = { halo: 11, off: 15, size: 16 } as const
/**
 * The ease in and out of a held or chosen track in milliseconds.
 */
const EASE        = { in: 120, out: 260 } as const
const NEAREST_KM  = 400
const DRIFT_KM    = 5
const DRIFT_PX    = 10
const MONO        = '"JetBrains Mono Variable", monospace'
const OVERHEAD_KM = 290
const PADDING     = 24
const REACH       = 16
const FARTHEST_KM = 25_000
/**
 * How many milliseconds the sky takes to gather into the numeral or to let it
 * go, and the radius in pixels of each satellite in it.
 */
const GATHER      = { ms: 1600, radius: 3 } as const
/**
 * The strength below which a track or its beads go undrawn.
 */
const FAINT       = 0.004
/**
 * The ring's halo, `halo` pixels wide at `alpha`, under its dots, `width`
 * pixels wide.
 */
export const RING = { alpha: 0.7, halo: 5.25, width: 2.25 } as const
/**
 * The chosen track's width in pixels at the horizon and straight overhead, the
 * held track's at its floor and at its highest, and the share of its strength
 * the stretch already flown draws at.
 */
const TRACK = { flown: 1 / 3, heldHigh: 3, heldLow: 0.5, high: 6, low: 1 } as const
/**
 * The dot's turn from filled to open: a share of its time above the horizon,
 * held between `least` and `most` seconds.
 */
const TURN = { least: 20, most: 180, share: 1 / 12 } as const
/**
 * The days past its epoch after which a satellite's ring spreads its dots to
 * twice and then three times `DOT_GAP`.
 */
export const SPREADS = [1, AGES.warn] as const
const FONTS = {
  city   : `13px ${BOOK}`,
  region : `500 10.5px ${MONO}`,
  spot   : `500 10px ${MONO}`,
  water  : `italic 13px ${BOOK}`
}

/**
 * Returns how near a satellite `height` kilometers up stands at `elevation`
 * degrees, from 0 at `FARTHEST_KM` or farther to 1 at `NEAREST_KM` or nearer
 * on a log scale.
 */
export const nearnessOf = (height: number, elevation: number) =>
  smooth(Math.log(FARTHEST_KM / slantOf(height, elevation)) / Math.log(FARTHEST_KM / NEAREST_KM))

/**
 * Returns the radius in pixels of a dot whose nearness is `nearness`.
 */
const radiusOf = (nearness: number) => 2 + 2.5 * nearness

/**
 * Returns how far a dot has emptied from filled to open at `seconds` into the
 * window, easing over `TURN` once its pass is past its nearest point.
 */
export const openOf = ({ peakAt, riseAt, setAt }: Pass, seconds: number) => {
  const turn = clamp(TURN.share * (setAt - riseAt), TURN.least, TURN.most)
  return seconds <= peakAt ? 0 : smooth((seconds - peakAt) / turn)
}

/**
 * Returns a dot's strength at its pass's ends, rising over its first
 * `DOT.ends` seconds and falling over its last, and held whole where the pass
 * is up before the window opens or after it closes.
 */
export const fadeOf = ({ earlier, later, riseAt, setAt }: Pass, seconds: number) => Math.min(
  earlier ? 1 : smooth((seconds - riseAt) / DOT.ends),
  later ? 1 : smooth((setAt - seconds) / DOT.ends)
)

/**
 * Moves a strength from `from` toward `to` by the share `rise` takes on the
 * way up and `fall` on the way down, settling at 0 once it is nearly gone.
 */
const toward = (from: number, to: number, rise: number, fall: number) => {
  const next = from + (to - from) * (to > from ? rise : fall)
  return next < 0.002 ? 0 : next
}

/**
 * Eases a share from 0 to 1 in and out, held at either end outside them.
 */
const smooth = (share: number) => share <= 0 ? 0 : share >= 1 ? 1 : share * share * (3 - 2 * share)

/**
 * Returns the gap in pixels between the ring's dots round a circle `around`
 * pixels long, for a satellite whose element set is `age` days past its epoch.
 */
export const ringGapOf = (around: number, age: number) =>
  around / Math.round(around / (DOT_GAP * spreadOf(age)))

/**
 * How many times `DOT_GAP` the ring's dots stand apart round a satellite whose
 * element set is `age` days past its epoch, one more past each of `SPREADS`.
 */
export const spreadOf = (age: number) => age > SPREADS[1] ? 3 : age > SPREADS[0] ? 2 : 1

/**
 * The two canvases above the map. The lower one holds what stays put between
 * map moves: place names and the spot. The upper one holds what moves with the
 * clock, and its loop makes no objects.
 */
export class Overlay {
  readonly view            = new View()
  /**
   * How many satellites the last frame drew inside the view, by kind in the
   * order of `KINDS`.
   */
  readonly onMap           = new Uint16Array(kindOrder.length)
  labels: readonly Label[] = []
  scheme: Scheme           = SCHEMES.day

  private still: CanvasRenderingContext2D
  private moving: CanvasRenderingContext2D
  private ratio              = 1
  private hitX               = new Float32Array(8192)
  private hitY               = new Float32Array(8192)
  private hitPass            = new Int32Array(8192)
  private hits               = 0
  private dots               = [0, 0]
  private eased              = performance.now()
  private heldStrength       = new Float32Array(256)
  private chosenStrength     = new Float32Array(256)
  private named: Kind | null = null
  private marks: Record<Kind, Path2D> | null = null
  private gatherX            = new Float32Array(0)
  private gatherY            = new Float32Array(0)
  private gathered           = 0
  private staleStill         = true

  constructor(stillCanvas: HTMLCanvasElement, movingCanvas: HTMLCanvasElement, private state: Drawn) {
    this.still  = stillCanvas.getContext('2d')!
    this.moving = movingCanvas.getContext('2d')!
  }

  resize(width: number, height: number, ratio: number) {
    this.ratio = ratio
    for (const context of [this.still, this.moving]) {
      context.canvas.width  = Math.round(width * ratio)
      context.canvas.height = Math.round(height * ratio)
    }
    this.staleStill = true
  }

  invalidate() { this.staleStill = true }

  /**
   * Gives each pass not yet set at `seconds` one of the points `slotsFor`
   * returns for that many passes, ranking the passes from the left where they
   * stand, which the sky gathers into while `Drawn.gathered` holds.
   */
  gather(
    tracks   : Tracks,
    seconds  : number,
    slotsFor : (count: number) => readonly (readonly [number, number])[]
  ) {
    const standing: [number, number][] = []
    this.gatherX                       = new Float32Array(tracks.passes.length).fill(NaN)
    this.gatherY                       = new Float32Array(tracks.passes.length)
    tracks.passes.forEach(({ riseAt, setAt }, pass) => {
      if (setAt >= seconds && tracks.at(pass, Math.max(seconds, riseAt))) {
        standing.push([this.view.column(tracks.longitude), pass])
      }
    })
    const slots = slotsFor(standing.length)
    if (!slots.length) return
    standing.sort(([a], [b]) => a - b).forEach(([, pass], rank) => {
      const [x, y]        = slots[Math.floor(rank * slots.length / standing.length)]
      this.gatherX[pass] = x
      this.gatherY[pass] = y
    })
  }

  /**
   * Returns the pass drawn nearest a pixel, or null when none is within reach.
   */
  nearest(x: number, y: number): number | null {
    let best: number | null = null
    let bestDistance        = REACH * REACH
    for (let index = 0; index < this.hits; index++) {
      const dx       = this.hitX[index] - x
      const dy       = this.hitY[index] - y
      const distance = dx * dx + dy * dy
      if (distance < bestDistance) {
        bestDistance = distance
        best         = this.hitPass[index]
      }
    }
    return best
  }

  /**
   * Marks every pass whose path above the horizon crosses the view, between
   * its samples as well as at them.
   */
  crossing(tracks: Tracks): Uint8Array {
    const flags    = new Uint8Array(tracks.passes.length)
    const { view } = this
    tracks.passes.forEach((pass, index) => {
      let previousX = NaN
      let previousY = NaN
      for (let at = pass.riseAt; at <= pass.setAt; at += TRACK_STEP) {
        if (!tracks.sample(index, at / TRACK_STEP)) continue
        const x    = view.column(tracks.longitude)
        const y    = view.row(tracks.latitude)
        const jump = Number.isNaN(previousX) || Math.abs(x - previousX) > view.world / 2
        if (view.crosses(jump ? x : previousX, jump ? y : previousY, x, y)) {
          flags[index] = 1
          return
        }
        previousX = x
        previousY = y
      }
    })
    return flags
  }

  draw(seconds: number) {
    if (this.staleStill) {
      this.drawStill()
      this.staleStill = false
    }
    this.drawMoving(seconds)
  }

  private drawStill() {
    const { ratio, state, still: context, view } = this
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, view.width, view.height)
    this.drawLabels(context)
    this.drawSpot(context, state.spot)
  }

  private drawLabels(context: CanvasRenderingContext2D) {
    const { view }       = this
    context.textAlign    = 'center'
    context.textBaseline = 'middle'
    context.lineJoin     = 'round'
    context.lineWidth    = 3
    for (const label of this.labels) {
      const x = view.column(label.longitude)
      const y = view.row(label.latitude)
      if (!view.inside(x, y, 40)) continue
      const text            = label.tier === 'city' ? label.name : label.name.toUpperCase()
      context.letterSpacing = label.tier === 'region' ? '1.1px' : '0px'
      context.font          = FONTS[label.tier]
      context.strokeStyle   = this.scheme.halo
      context.fillStyle     = label.tier === 'water' ? this.scheme.soft : this.scheme.ink
      context.strokeText(text, x, y)
      context.fillText(text, x, y)
    }
    context.letterSpacing = '0px'
  }

  private drawSpot(context: CanvasRenderingContext2D, spot: Spot) {
    const { view }      = this
    const x             = view.column(spot.longitude)
    const y             = view.row(spot.latitude)
    const radius        = OVERHEAD_KM * view.scale(spot.latitude)
    context.strokeStyle = this.scheme.ink
    context.globalAlpha = 0.55
    context.lineWidth   = 1
    context.setLineDash([3, 4])
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.stroke()
    context.setLineDash([])
    context.globalAlpha = 1
    if (radius > 56) {
      const note            = '60° UP AT 550 KM'
      const top             = y - radius - 8
      context.font          = FONTS.spot
      context.letterSpacing = '1px'
      context.textAlign     = 'center'
      context.lineWidth     = 3
      context.strokeStyle   = this.scheme.halo
      context.fillStyle     = this.scheme.ink
      context.strokeText(note, x, top)
      context.fillText(note, x, top)
      context.letterSpacing = '0px'
    }
    context.fillStyle   = this.scheme.spot
    context.strokeStyle = this.scheme.halo
    context.lineWidth   = 2
    context.beginPath()
    context.arc(x, y, 5.5, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }

  private drawMoving(seconds: number) {
    const { moving: context, ratio, state, view } = this
    const { tracks }                               = state
    this.named                                     = state.named
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, view.width, view.height)
    this.onMap.fill(0)
    this.hits = 0
    this.ease(state)
    if (this.gathered > 0) return this.drawGathered(context, tracks, seconds)

    context.lineCap  = 'round'
    context.lineJoin = 'round'
    for (let pass = 0; pass < tracks.passes.length; pass++) {
      const held   = this.heldStrength[pass]
      const chosen = this.chosenStrength[pass]
      if (held + chosen < FAINT) continue
      const { riseAt, setAt } = tracks.passes[pass]
      this.drawTrack(context, tracks, pass, riseAt, setAt, TRACK.heldLow, TRACK.heldHigh, 0.55 * held)
      if (chosen < FAINT) continue
      this.drawTrack(context, tracks, pass, riseAt, seconds, TRACK.low, TRACK.high, TRACK.flown * chosen)
      this.drawTrack(context, tracks, pass, seconds, setAt, TRACK.low, TRACK.high, chosen)
      this.drawPeak(context, tracks, pass, chosen)
    }

    let chosen         = -1
    const { selected } = state
    for (let pass = 0; pass < tracks.passes.length; pass++) {
      if (!tracks.up(pass, seconds)) continue
      const x = view.column(tracks.longitude)
      const y = view.row(tracks.latitude)
      if (!view.inside(x, y, PADDING)) continue
      const { kind } = tracks.passes[pass]
      if (view.inside(x, y)) this.onMap[kindSlots[kind]]++
      this.remember(x, y, pass)
      if (tracks.passes[pass] === selected) chosen = pass
      this.drawDot(context, tracks, pass, seconds, state.traced(pass), x, y)
    }

    if (chosen >= 0 && tracks.up(chosen, seconds)) {
      this.drawRing(context, tracks, chosen, state.start + seconds * 1000)
    }
    context.globalAlpha = 1
  }

  /**
   * Draws each pass `gather` gave a point, moved from where it stands toward
   * that point by the share of the way the sky has gathered, in one tone.
   */
  private drawGathered(context: CanvasRenderingContext2D, tracks: Tracks, seconds: number) {
    const { view } = this
    const share    = smooth(this.gathered)
    for (let pass = 0; pass < this.gatherX.length; pass++) {
      if (Number.isNaN(this.gatherX[pass])) continue
      const { height, riseAt, setAt } = tracks.passes[pass]
      const up                        = tracks.up(pass, seconds)
      if (!up && !tracks.at(pass, clamp(seconds, riseAt, setAt))) continue
      const fromX  = view.column(tracks.longitude)
      const fromY  = view.row(tracks.latitude)
      const x      = fromX + (this.gatherX[pass] - fromX) * share
      const y      = fromY + (this.gatherY[pass] - fromY) * share
      const near   = up ? radiusOf(nearnessOf(height, tracks.elevation)) : GATHER.radius
      const radius = near + (GATHER.radius - near) * share
      context.globalAlpha = (up ? 1 : share) * 0.55
      context.fillStyle   = this.scheme.halo
      discAt(context, x, y, radius + DOT.halo)
      context.globalAlpha = up ? 1 : share
      context.fillStyle   = this.scheme.dim
      discAt(context, x, y, radius)
    }
    context.globalAlpha = 1
  }

  /**
   * Eases each pass's held and chosen strengths toward the pass held and the
   * pass chosen, over `EASE` and at once under reduced motion, growing the
   * arrays they sit in only as the passes outgrow them.
   */
  private ease(state: Drawn) {
    const { passes } = state.tracks
    if (passes.length > this.heldStrength.length) {
      const size          = 2 ** Math.ceil(Math.log2(passes.length))
      const held          = new Float32Array(size)
      const chosen        = new Float32Array(size)
      held.set(this.heldStrength)
      chosen.set(this.chosenStrength)
      this.heldStrength   = held
      this.chosenStrength = chosen
    }
    const now      = performance.now()
    const elapsed  = Math.min(50, now - this.eased)
    this.eased     = now
    const share    = state.reduced ? 1 : elapsed / GATHER.ms
    this.gathered  = clamp(this.gathered + (state.gathered ? share : -share), 0, 1)
    const rise     = state.reduced ? 1 : 1 - Math.exp(-elapsed / EASE.in)
    const fall     = state.reduced ? 1 : 1 - Math.exp(-elapsed / EASE.out)
    const { held: shown, selected } = state
    for (let pass = 0; pass < passes.length; pass++) {
      const chosen = passes[pass] === selected ? 1 : 0
      const held   = passes[pass] === shown && !chosen ? 1 : 0
      this.chosenStrength[pass] = toward(this.chosenStrength[pass], chosen, rise, fall)
      this.heldStrength[pass]   = toward(this.heldStrength[pass], held, rise, fall)
    }
  }

  /**
   * Fills a pass's track from `from` to `to` seconds as a ribbon whose width
   * follows the sine of its elevation from `low` to `high` pixels, in its
   * kind's color over a halo 3 pixels wider.
   */
  private drawTrack(
    context : CanvasRenderingContext2D,
    tracks  : Tracks,
    pass    : number,
    from    : number,
    to      : number,
    low     : number,
    high    : number,
    alpha   : number
  ) {
    const { kind, riseAt, setAt } = tracks.passes[pass]
    const start                   = Math.max(from, riseAt)
    const end                     = Math.min(to, setAt)
    if (end <= start || alpha < FAINT) return
    const strength      = alpha * this.strength(kind)
    context.globalAlpha = 0.7 * strength
    context.fillStyle   = this.scheme.halo
    if (this.ribbon(context, tracks, pass, start, end, low, high, 3)) context.fill()
    context.globalAlpha = strength
    context.fillStyle   = this.scheme.kinds[kind]
    if (this.ribbon(context, tracks, pass, start, end, low, high, 0)) context.fill()
  }

  /**
   * Traces a stretch of track as one closed outline, down one side and back up
   * the other, so a faint stretch shows no overlaps, returning false where the
   * stretch crosses the edge of the world.
   */
  private ribbon(
    context : CanvasRenderingContext2D,
    tracks  : Tracks,
    pass    : number,
    start   : number,
    end     : number,
    low     : number,
    high    : number,
    grow    : number
  ): boolean {
    const { view } = this
    const first    = Math.ceil(start / TRACK_STEP + 1e-6)
    const last     = Math.floor(end / TRACK_STEP - 1e-6)
    const points   = Math.max(last - first + 1, 0) + 2
    context.beginPath()
    for (let side = 1; side >= -1; side -= 2) {
      for (let step = 0; step < points; step++) {
        const index   = side > 0 ? step : points - 1 - step
        const seconds = index === 0 ? start : index === points - 1 ? end : (first + index - 1) * TRACK_STEP
        if (!tracks.at(pass, seconds)) return false
        const x       = view.column(tracks.longitude)
        const y       = view.row(tracks.latitude)
        const sine    = Math.sin(Math.max(tracks.elevation, 0) * Math.PI / 180)
        const half    = (low + (high - low) * sine + grow) / 2
        if (!tracks.at(pass, Math.min(seconds + 1, (tracks.samples - 1) * TRACK_STEP))) return false
        let dx        = view.column(tracks.longitude) - x
        let dy        = view.row(tracks.latitude) - y
        const length  = Math.hypot(dx, dy)
        if (length > view.world / 2) return false
        dx            = length ? dx / length : 1
        dy            = length ? dy / length : 0
        context.lineTo(x - dy * half * side, y + dx * half * side)
      }
    }
    context.closePath()
    return true
  }

  /**
   * Marks the chosen pass's highest point, an ink dot on a panel disc.
   */
  private drawPeak(context: CanvasRenderingContext2D, tracks: Tracks, pass: number, alpha: number) {
    const { kind, peakAt } = tracks.passes[pass]
    if (!tracks.at(pass, peakAt)) return
    const x             = this.view.column(tracks.longitude)
    const y             = this.view.row(tracks.latitude)
    context.globalAlpha = alpha * this.strength(kind)
    context.fillStyle   = this.scheme.panel
    discAt(context, x, y, 4.5)
    context.fillStyle = this.scheme.ink
    discAt(context, x, y, 2.5)
  }

  /**
   * Draws a satellite as a dot in the one tone, 2 pixels plus 2.5 for its
   * nearness and strengthened by it, laying `BEADS` behind it and emptying to
   * an open ring past its nearest point. The held and the chosen dots take
   * their kind's color and a ring, and a dot the filters leave out draws at
   * half strength, its beads included. Draws at `x`, `y`, the place `tracks.up`
   * wrote, since laying the beads reads other moments into `tracks`.
   */
  private drawDot(
    context : CanvasRenderingContext2D,
    tracks  : Tracks,
    pass    : number,
    seconds : number,
    traced  : boolean,
    x       : number,
    y       : number
  ) {
    const { state }   = this
    const record      = tracks.passes[pass]
    const nearness    = nearnessOf(record.height, tracks.elevation)
    const radius      = radiusOf(nearness)
    const open        = openOf(record, seconds)
    const held        = record === state.selected || record === state.held
    const color       = held ? this.scheme.kinds[record.kind] : this.scheme.dim
    let alpha         = (0.45 + 0.55 * nearness) * fadeOf(record, seconds) * (traced ? 1 : 0.5)
    if (held) alpha   = Math.max(alpha, 0.9)
    alpha            *= this.strength(record.kind)
    context.fillStyle   = color
    context.strokeStyle = color
    this.drawBeads(context, tracks, pass, seconds, alpha, radius * BEADS.size, x, y)
    alpha              *= 1 - DOT.open * open
    context.globalAlpha = 0.55 * alpha
    context.fillStyle   = this.scheme.halo
    discAt(context, x, y, radius + DOT.halo)
    context.globalAlpha = alpha
    context.fillStyle   = color
    dotAt(context, x, y, radius, open, DOT.halo)
    if (!held) return
    context.globalAlpha = this.strength(record.kind)
    context.lineWidth   = 1.5
    context.beginPath()
    context.arc(x, y, radius + DOT.held, 0, Math.PI * 2)
    context.stroke()
    if (record === state.held) this.drawBadge(context, record.kind, x, y)
  }

  /**
   * Draws the kind's mark on its halo at the corner of the dot at `x`, `y` up
   * and to the right, turning to the left or down where the mark would leave
   * the view.
   */
  private drawBadge(context: CanvasRenderingContext2D, kind: Kind, x: number, y: number) {
    this.marks ??= Object.fromEntries(kindOrder.map(each => [each, new Path2D(iconOf(each, BADGE.size))])) as
      Record<Kind, Path2D>
    const { view } = this
    const centerX  = x + (x + BADGE.off + BADGE.halo > view.width ? -BADGE.off : BADGE.off)
    const centerY  = y + (y - BADGE.off - BADGE.halo < 0 ? BADGE.off : -BADGE.off)
    context.globalAlpha = 0.9
    context.fillStyle   = this.scheme.halo
    discAt(context, centerX, centerY, BADGE.halo)
    context.globalAlpha = 1
    context.fillStyle   = this.scheme.kinds[kind]
    const scale         = BADGE.size / GRID
    context.setTransform(this.ratio * scale, 0, 0, this.ratio * scale,
      this.ratio * (centerX - BADGE.size / 2), this.ratio * (centerY - BADGE.size / 2))
    context.fill(this.marks[kind])
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
  }

  /**
   * Lays the beads behind a dot at `x`, `y`, each at a fixed second of the
   * window so it holds its place on the ground, as open as the dot was when it
   * laid it, fading with its age over `BEADS.count` intervals.
   */
  private drawBeads(
    context : CanvasRenderingContext2D,
    tracks  : Tracks,
    pass    : number,
    seconds : number,
    alpha   : number,
    radius  : number,
    x       : number,
    y       : number
  ) {
    const { view } = this
    const record   = tracks.passes[pass]
    if (!tracks.at(pass, Math.max(seconds - TRACK_STEP, 0))) return
    const pace = Math.hypot(view.column(tracks.longitude) - x, view.row(tracks.latitude) - y) / TRACK_STEP
    if (pace * TRACK_STEP > view.world / 2) return
    let step = BEADS.step
    while (step * pace < BEADS.gap && step < BEADS.most) step *= 2
    const life  = step * BEADS.count
    const first = Math.floor(seconds / step) * step
    for (let laid = first; laid > seconds - life && laid >= record.riseAt; laid -= step) {
      if (!tracks.at(pass, laid)) continue
      const open          = openOf(record, laid)
      context.globalAlpha = alpha * BEADS.ink * (1 - (seconds - laid) / life) ** 1.3
      dotAt(context, view.column(tracks.longitude), view.row(tracks.latitude), radius, open, 0.4)
    }
  }

  /**
   * Returns the share of its own alpha a kind draws at, all of it unless the
   * tally names another.
   */
  private strength(kind: Kind): number { return this.named === null || this.named === kind ? 1 : DIM }

  /**
   * Draws a dotted ring `DRIFT_KM` out round the chosen satellite in its
   * kind's color, once that distance spans `DRIFT_PX` at its latitude, its
   * dots spread by `spreadOf` the age of the satellite's element set at
   * `time`.
   */
  private drawRing(context: CanvasRenderingContext2D, tracks: Tracks, pass: number, time: number) {
    const { dots, view } = this
    const radius         = DRIFT_KM * view.scale(tracks.latitude)
    if (radius < DRIFT_PX) return
    const around = 2 * Math.PI * radius
    dots[1]      = ringGapOf(around, ageOf(tracks.passes[pass].epoch, time))
    context.save()
    context.setLineDash(dots)
    context.beginPath()
    context.arc(view.column(tracks.longitude), view.row(tracks.latitude), radius, 0, Math.PI * 2)
    context.lineCap     = 'round'
    context.globalAlpha = RING.alpha
    context.strokeStyle = this.scheme.halo
    context.lineWidth   = RING.halo
    context.stroke()
    context.globalAlpha = 1
    context.strokeStyle = this.scheme.kinds[tracks.passes[pass].kind]
    context.lineWidth   = RING.width
    context.stroke()
    context.restore()
  }

  private remember(x: number, y: number, pass: number) {
    if (this.hits === this.hitX.length) return
    this.hitX[this.hits]    = x
    this.hitY[this.hits]    = y
    this.hitPass[this.hits] = pass
    this.hits++
  }
}

/**
 * Draws a mark `radius` pixels round that is a filled disc at `open` 0 and a
 * ring at `open` 1 as wide as `DOT.thin` or 0.6 of `radius`, whichever is
 * less, its stroke thinning inward while its outer edge grows by `grow`
 * pixels, so the fill drains from the middle.
 */
const dotAt = (
  context : CanvasRenderingContext2D,
  x       : number,
  y       : number,
  radius  : number,
  open    : number,
  grow    : number
) => {
  if (open <= 0.01) return discAt(context, x, y, radius)
  const thin        = Math.min(DOT.thin, radius * 0.6)
  const width       = radius + (thin - radius) * open
  context.lineWidth = width
  context.beginPath()
  context.arc(x, y, radius + grow * open - width / 2, 0, Math.PI * 2)
  context.stroke()
}

/**
 * Fills a disc `radius` pixels round at `x`, `y`.
 */
const discAt = (context: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()
}
