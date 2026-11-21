import { AGES, ageOf }                      from '../orbit/catalog.ts'
import { slantOf }                          from '../orbit/compass.ts'
import { kindOrder, kindSlots, type Kind }  from '../orbit/kinds.ts'
import { TRACK_STEP, type Pass, type Spot } from '../orbit/scan.ts'
import { GRID, iconOf }                     from '../site/icons.ts'
import { clamp }                            from '../site/motion.ts'
import { SCHEMES, type Scheme }             from '../site/palette.ts'
import { type Tracks, pointsOf, secondsOf } from '../state/tracks.ts'
import { type Box, View, boxAround, grown } from './mercator.ts'
import * as places                          from './places.ts'

interface Drawn {
  gathered : boolean
  held     : Pass | null
  /**
   * Whether each kind is shown, every pass of a kind not shown drawing neither
   * a dot nor a track.
   */
  kinds    : Readonly<Record<Kind, boolean>>
  named    : Kind | null
  reduced  : boolean
  selected : Pass | null
  spot     : Spot | null
  start    : number
  traced   : (pass: number) => boolean
  tracks   : Tracks
}

/**
 * How a tier of names is set: its canvas font and letter spacing on a view at
 * least `WIDE` pixels wide and on a narrower one, the scheme's token for its
 * tone, and whether it is set in capitals.
 */
interface Face {
  fonts   : readonly [string, string]
  spacing : readonly [string, string]
  tone    : 'label' | 'quiet'
  upper   : boolean
}

export interface Label {
  latitude  : number
  longitude : number
  name      : string
  tier      : 'region' | 'city' | 'water'
}

/**
 * The ring round the spot, `radius` pixels round its middle at `x`, `y`.
 */
export interface Ring {
  radius : number
  x      : number
  y      : number
}

/**
 * The beads behind each dot: about `gap` pixels apart, laid at an interval
 * doubling from `step` seconds of the window up to `most`, fading over the
 * last `count`, each `size` times its dot's radius at `ink` of its alpha.
 */
export const BEADS = { count: 5, gap: 9, ink: 0.7, most: 640, size: 0.6, step: 2 } as const
const BOOK        = '"Newsreader Variable", serif'
/**
 * The ring's caption, set along the ring in the mono with `spacing` pixels
 * between its letters, on a ring more than `least` pixels across, with names
 * kept `clear` pixels off it. It stands `above` pixels past the ring on its
 * upper side, and `below` pixels past it on its lower side, which takes every
 * place whose sine is past `low`.
 */
const CAPTION     = { above: 9, below: 11, clear: 2, least: 56, low: 0.2, spacing: 1.4 } as const
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
 * The pointer toward a chosen satellite past the open map: how far in pixels
 * it stands inside the map's edge and outside a panel running across it, how
 * far it stands clear of a panel at one side, and the length of its arrowhead.
 */
const AIM         = { clear: 44, edge: 22, head: 9 } as const
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
 * The width in pixels of the halo under each name and the caption's letters.
 */
const HALO        = 3.5
/**
 * The most names a view narrower than `WIDE` keeps.
 */
const NARROW_MOST = 20
const NOTE        = '60° UP AT 550 KM'
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
 * The veil in the page's tone over all that lies outside the ring, easing in
 * from `inset` pixels past the ring to full `strength` across `feather` of its
 * radius, and leaving clear a circle `around` pixels past the chosen
 * satellite's drift ring, or past `least` pixels where that ring is smaller.
 */
const VEIL = { around: 6, feather: 0.9, inset: 1.5, least: 8, strength: 0.4 } as const
/**
 * The view width in pixels from which the names take their larger faces.
 */
const WIDE      = 1280
const untracked = new Float32Array(0)
/**
 * The days past its epoch after which a satellite's ring spreads its dots to
 * twice and then three times `DOT_GAP`.
 */
export const SPREADS = [1, AGES.warn] as const
const FACES = {
  city: {
    fonts   : [`500 15.5px ${BOOK}`, `13px ${BOOK}`],
    spacing : ['0px', '0px'],
    tone    : 'label',
    upper   : false
  },

  region: {
    fonts   : [`500 12px ${MONO}`, `500 10.5px ${MONO}`],
    spacing : ['3.8px', '1.6px'],
    tone    : 'quiet',
    upper   : true
  },

  water: {
    fonts   : [`italic 15.5px ${BOOK}`, `italic 13px ${BOOK}`],
    spacing : ['0.2px', '0px'],
    tone    : 'quiet',
    upper   : false
  }
} as const satisfies Record<Label['tier'], Face>
const CAPTION_FONT = `500 10px ${MONO}`
const letters      = [...NOTE]

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
   * order of `KINDS`, at zero for each kind not shown.
   */
  readonly onMap           = new Uint16Array(kindOrder.length)
  labels: readonly Label[] = []
  scheme: Scheme           = SCHEMES.day
  /**
   * Returns the boxes of the panels over the map, which names stay out of.
   */
  covered: () => readonly Box[] = () => []

  /**
   * The panels over the map as the still layer last read them, which the
   * pointer toward a chosen satellite stays clear of.
   */
  private panels: readonly Box[] = []
  private open                   = { bottom: 0, left: 0, right: 0, top: 0 }
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
  /**
   * The chosen pass the names were last placed around.
   */
  private placedFor: Pass | null = null
  /**
   * The boxes of the names whose places stand inside the ring, four numbers
   * each, which the veil leaves clear, and how many there are.
   */
  private clearings          = new Float32Array(4 * places.MOST)
  private cleared            = 0
  /**
   * Each letter of the caption as `x`, `y`, and its turn in radians, and
   * whether the caption found a place.
   */
  private letterAt           = new Float32Array(3 * letters.length)
  private captioned          = false
  private veilFill: CanvasGradient | null = null

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
    if (this.staleStill || this.state.selected !== this.placedFor) {
      this.drawStill()
      this.staleStill = false
    }
    this.drawMoving(seconds)
  }

  private drawStill() {
    const { ratio, state, still: context, view } = this
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, view.width, view.height)
    this.placedFor          = state.selected
    const ring: Ring | null = state.spot && {
      radius : OVERHEAD_KM * view.scale(state.spot.latitude),
      x      : view.column(state.spot.longitude),
      y      : view.row(state.spot.latitude)
    }
    this.veilFill = ring && this.veilOf(ring)
    this.drawLabels(context, ring)
    if (ring) this.drawSpot(context, ring.x, ring.y, ring.radius)
  }

  /**
   * Places the names and the ring's caption clear of the panels over the map,
   * the spot's marker, the ring's line, the chosen pass's track, and each
   * other, per `places.Layout`, and sets each name kept, noting those whose
   * places stand inside the ring for the veil to leave clear.
   */
  private drawLabels(context: CanvasRenderingContext2D, ring: Ring | null) {
    const { state, view } = this
    const narrow          = view.width >= WIDE ? 0 : 1
    const chosen          = state.selected ? state.tracks.passes.indexOf(state.selected) : -1
    const track           = chosen < 0 ? untracked : places.trackOf(chosen, state.tracks, view)
    const words           = this.labels.map(label => this.measure(context, label, narrow))
    const layout          = new places.Layout(track, view, words, ring)
    const covered         = this.covered()
    const blocked         = [...covered]
    this.opened(covered)
    this.captioned        = false
    if (ring) blocked.push(boxAround(ring.x, ring.y, places.ROOM.spot, places.ROOM.spot))
    if (ring && ring.radius > CAPTION.least) {
      context.font          = CAPTION_FONT
      context.letterSpacing = `${CAPTION.spacing}px`
      const at              = layout.caption(covered, context.measureText(NOTE).width)
      if (at) {
        blocked.push(grown(at.box, CAPTION.clear))
        this.layCaption(context, at.angle, ring)
      }
    }
    this.haloed(context)
    this.cleared = 0
    const most   = narrow ? NARROW_MOST : places.MOST
    for (const { box, word } of layout.place(blocked, most)) {
      const face = FACES[word.label.tier]
      const x    = (box.left + box.right) / 2
      const y    = (box.top + box.bottom) / 2
      if (ring && Math.hypot(word.x - ring.x, word.y - ring.y) <= ring.radius) {
        this.clear(grown(box, HALO / 2 + 1))
      }
      context.font          = face.fonts[narrow]
      context.letterSpacing = face.spacing[narrow]
      context.fillStyle     = this.scheme[face.tone]
      context.strokeText(word.text, x, y)
      context.fillText(word.text, x, y)
    }
    context.letterSpacing = '0px'
  }

  /**
   * Sets the halo every name and the caption's letters are stroked with, each
   * centered on its point.
   */
  private haloed(context: CanvasRenderingContext2D) {
    context.textAlign    = 'center'
    context.textBaseline = 'middle'
    context.lineJoin     = 'round'
    context.lineWidth    = HALO
    context.strokeStyle  = this.scheme.halo
  }

  /**
   * Measures a name in its tier's face, `narrow` being 0 on a view at least
   * `WIDE` pixels across and 1 on a narrower one.
   */
  private measure(context: CanvasRenderingContext2D, label: Label, narrow: 0 | 1): places.Word {
    const face            = FACES[label.tier]
    const text            = face.upper ? label.name.toUpperCase() : label.name
    context.font          = face.fonts[narrow]
    context.letterSpacing = face.spacing[narrow]
    const metrics         = context.measureText(text)
    return {
      height : metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + 2,
      label  : label,
      text   : text,
      width  : metrics.width + 2,
      x      : this.view.column(label.longitude),
      y      : this.view.row(label.latitude)
    }
  }

  /**
   * Notes `box` as one the veil leaves clear.
   */
  private clear({ bottom, left, right, top }: Box) {
    const at                = 4 * this.cleared++
    this.clearings[at]      = left
    this.clearings[at + 1]  = top
    this.clearings[at + 2]  = right - left
    this.clearings[at + 3]  = bottom - top
  }

  /**
   * Sets each letter of the caption along `ring`, centered on `angle`, upright
   * to a reader on whichever side of the ring it stands.
   */
  private layCaption(context: CanvasRenderingContext2D, angle: number, { radius, x, y }: Ring) {
    const below           = Math.sin(angle) > CAPTION.low
    const along           = radius + (below ? CAPTION.below : CAPTION.above)
    context.font          = CAPTION_FONT
    context.letterSpacing = '0px'
    const widths          = letters.map(letter => context.measureText(letter).width + CAPTION.spacing)
    const span            = widths.reduce((sum, width) => sum + width, 0) / along
    let at                = below ? angle + span / 2 : angle - span / 2
    widths.forEach((width, index) => {
      const step                    = (below ? -width : width) / along
      const middle                  = at + step / 2
      this.letterAt[3 * index]      = x + Math.cos(middle) * along
      this.letterAt[3 * index + 1]  = y + Math.sin(middle) * along
      this.letterAt[3 * index + 2]  = middle + (below ? -Math.PI / 2 : Math.PI / 2)
      at                           += step
    })
    this.captioned = true
  }

  /**
   * Returns the veil's fill round `ring`, clear to the ring's edge and the
   * page's tone `VEIL.feather` of its radius past it.
   */
  private veilOf({ radius, x, y }: Ring): CanvasGradient {
    const edge = radius + VEIL.inset
    const fill = this.moving.createRadialGradient(x, y, edge, x, y, edge + radius * VEIL.feather)
    fill.addColorStop(0, `${this.scheme.page}00`)
    fill.addColorStop(1, this.scheme.page)
    return fill
  }

  private drawSpot(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    context.strokeStyle = this.scheme.ink
    context.globalAlpha = 0.55
    context.lineWidth   = 1
    context.setLineDash([3, 4])
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.stroke()
    context.setLineDash([])
    context.globalAlpha = 1
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
      const { kind, riseAt, setAt } = tracks.passes[pass]
      if (!state.kinds[kind]) continue
      this.drawTrack(context, tracks, pass, riseAt, setAt, TRACK.heldLow, TRACK.heldHigh, 0.55 * held)
      if (chosen < FAINT) continue
      this.drawTrack(context, tracks, pass, riseAt, seconds, TRACK.low, TRACK.high, TRACK.flown * chosen)
      this.drawTrack(context, tracks, pass, seconds, setAt, TRACK.low, TRACK.high, chosen)
      this.drawPeak(context, tracks, pass, chosen)
    }

    let chosen               = -1
    let aimed                = false
    let aimX                 = 0
    let aimY                 = 0
    const { held, selected } = state
    for (let pass = 0; pass < tracks.passes.length; pass++) {
      const record = tracks.passes[pass]
      if (!state.kinds[record.kind]) continue
      if (tracks.docked.has(pass) && record !== selected && record !== held) continue
      if (!tracks.up(pass, seconds)) continue
      const x = view.column(tracks.longitude)
      const y = view.row(tracks.latitude)
      if (record === selected) {
        aimed = true
        aimX  = x
        aimY  = y
      }
      if (!view.inside(x, y, PADDING)) continue
      if (view.inside(x, y)) this.onMap[kindSlots[record.kind]]++
      this.remember(x, y, pass)
      if (record === selected) chosen = pass
      this.drawDot(context, tracks, pass, seconds, state.traced(pass), x, y)
    }

    const flying = chosen >= 0 && tracks.up(chosen, seconds)
    if (flying) this.drawRing(context, tracks, chosen, state.start + seconds * 1000)
    context.globalAlpha = 1
    this.drawVeil(context, flying)
    this.drawCaption(context)
    if (aimed && selected) this.drawPointer(context, selected.kind, aimX, aimY)
  }

  /**
   * Sets the part of the map the pointer stands in: the view inside
   * `AIM.edge`, short of each panel in `covered` running across it, which
   * keeps the panels at one side for the pointer to stay clear of.
   */
  private opened(covered: readonly Box[]) {
    const { open, view } = this
    this.panels          = covered
    open.left            = AIM.edge
    open.right           = view.width - AIM.edge
    open.top             = AIM.edge
    open.bottom          = view.height - AIM.edge
    for (const { bottom, left, right, top } of covered) {
      if (right - left < view.width * places.ACROSS) continue
      if (top + bottom > view.height) open.bottom = Math.min(open.bottom, top - AIM.edge)
      else open.top = Math.max(open.top, bottom + AIM.edge)
    }
  }

  /**
   * Points toward the chosen satellite at `x`, `y` where it stands past the
   * open map or under a panel at one side: an arrowhead in its kind's color
   * where the line from the spot toward it leaves the open map or meets a
   * panel, and the kind's mark on its halo behind the arrowhead.
   */
  private drawPointer(context: CanvasRenderingContext2D, kind: Kind, x: number, y: number) {
    const { open, panels, ratio, state, view } = this
    let under = false
    for (let index = 0; index < panels.length; index++) {
      under ||= !across(panels[index], view.width) && insideOf(panels[index], x, y, AIM.edge)
    }
    if (!under && x > open.left && x < open.right && y > open.top && y < open.bottom) return
    const spotX  = state.spot ? view.column(state.spot.longitude) : view.width / 2
    const spotY  = state.spot ? view.row(state.spot.latitude) : view.height / 2
    const inside = spotX > open.left && spotX < open.right && spotY > open.top && spotY < open.bottom
    const fromX  = inside ? spotX : (open.left + open.right) / 2
    const fromY  = inside ? spotY : (open.top + open.bottom) / 2
    const length = Math.hypot(x - fromX, y - fromY)
    if (length < 1) return
    const dx     = (x - fromX) / length
    const dy     = (y - fromY) / length
    let reach    = Math.min(
      dx > 0 ? (open.right - fromX) / dx : dx < 0 ? (open.left - fromX) / dx : Infinity,
      dy > 0 ? (open.bottom - fromY) / dy : dy < 0 ? (open.top - fromY) / dy : Infinity,
      length
    )
    for (let index = 0; index < panels.length; index++) {
      const box = panels[index]
      if (across(box, view.width) || insideOf(box, fromX, fromY, AIM.clear)) continue
      reach = Math.min(reach, enteringOf(box, AIM.clear, fromX, fromY, dx, dy))
    }
    const tipX = fromX + dx * reach
    const tipY = fromY + dy * reach
    const head = AIM.head
    context.globalAlpha = 1
    context.setTransform(ratio * dx, ratio * dy, -ratio * dy, ratio * dx, ratio * tipX, ratio * tipY)
    context.beginPath()
    context.moveTo(head, 0)
    context.lineTo(-head * 0.7, -head * 0.8)
    context.lineTo(-head * 0.3, 0)
    context.lineTo(-head * 0.7, head * 0.8)
    context.closePath()
    context.lineJoin    = 'round'
    context.lineWidth   = 2
    context.strokeStyle = this.scheme.halo
    context.stroke()
    context.fillStyle   = this.scheme.kinds[kind]
    context.fill()
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    const back = head + BADGE.halo + 6
    this.drawMark(context, kind, tipX - dx * back, tipY - dy * back)
  }

  /**
   * Lays the veil over the map, its names, and the tracks outside the ring,
   * leaving clear each name whose place stands inside it and, while `flying`,
   * the chosen satellite and its drift ring at the place `tracks.up` wrote.
   */
  private drawVeil(context: CanvasRenderingContext2D, flying: boolean) {
    const { clearings, state, veilFill, view } = this
    if (!veilFill) return
    context.save()
    context.beginPath()
    context.rect(0, 0, view.width, view.height)
    for (let index = 0; index < 4 * this.cleared; index += 4) {
      context.rect(clearings[index], clearings[index + 1], clearings[index + 2], clearings[index + 3])
    }
    if (flying) {
      const { latitude, longitude } = state.tracks
      const around                  = Math.max(DRIFT_KM * view.scale(latitude), VEIL.least) + VEIL.around
      const x                       = view.column(longitude)
      const y                       = view.row(latitude)
      context.moveTo(x + around, y)
      context.arc(x, y, around, 0, Math.PI * 2)
    }
    context.clip('evenodd')
    context.globalAlpha = VEIL.strength
    context.fillStyle   = veilFill
    context.fillRect(0, 0, view.width, view.height)
    context.restore()
  }

  /**
   * Sets the ring's caption letter by letter where `layCaption` placed it,
   * over the veil.
   */
  private drawCaption(context: CanvasRenderingContext2D) {
    if (!this.captioned) return
    const { letterAt, ratio } = this
    this.haloed(context)
    context.font          = CAPTION_FONT
    context.letterSpacing = '0px'
    context.fillStyle     = this.scheme.ink
    for (let index = 0; index < letters.length; index++) {
      const cos = Math.cos(letterAt[3 * index + 2])
      const sin = Math.sin(letterAt[3 * index + 2])
      context.setTransform(ratio * cos, ratio * sin, -ratio * sin, ratio * cos,
        ratio * letterAt[3 * index], ratio * letterAt[3 * index + 1])
      context.strokeText(letters[index], 0, 0)
      context.fillText(letters[index], 0, 0)
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  /**
   * Draws each pass `gather` gave a point, moved from where it stands toward
   * that point by the share of the way the sky has gathered, in one tone,
   * skipping the points of passes `tracks` no longer holds.
   */
  private drawGathered(context: CanvasRenderingContext2D, tracks: Tracks, seconds: number) {
    const { view } = this
    const count    = Math.min(this.gatherX.length, tracks.passes.length)
    const share    = smooth(this.gathered)
    for (let pass = 0; pass < count; pass++) {
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
    const points   = pointsOf(end, start)
    context.beginPath()
    for (let side = 1; side >= -1; side -= 2) {
      for (let step = 0; step < points; step++) {
        const index   = side > 0 ? step : points - 1 - step
        const seconds = secondsOf(end, index, points, start)
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
   * their kind's color and a ring, and a dot whose pass the filters leave out
   * of the list draws at half strength, its beads included. Draws at `x`, `y`,
   * the place `tracks.up` wrote, since laying the beads reads other moments
   * into `tracks`.
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
    const { view } = this
    const centerX  = x + (x + BADGE.off + BADGE.halo > view.width ? -BADGE.off : BADGE.off)
    const centerY  = y + (y - BADGE.off - BADGE.halo < 0 ? BADGE.off : -BADGE.off)
    this.drawMark(context, kind, centerX, centerY)
  }

  /**
   * Draws the kind's mark on its halo centered on `centerX`, `centerY`.
   */
  private drawMark(context: CanvasRenderingContext2D, kind: Kind, centerX: number, centerY: number) {
    this.marks ??= Object.fromEntries(kindOrder.map(each => [each, new Path2D(iconOf(each, BADGE.size))])) as
      Record<Kind, Path2D>
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
 * Whether a panel runs across a map `width` pixels wide rather than standing
 * at one side.
 */
const across = ({ left, right }: Box, width: number) => right - left >= width * places.ACROSS

/**
 * Whether `x`, `y` stands inside `box` grown by `by` pixels.
 */
const insideOf = ({ bottom, left, right, top }: Box, x: number, y: number, by: number) =>
  x > left - by && x < right + by && y > top - by && y < bottom + by

/**
 * Returns how far along the ray from `x`, `y` by `dx`, `dy` it enters `box`
 * grown by `by` pixels, or Infinity where it never does.
 */
const enteringOf = (box: Box, by: number, x: number, y: number, dx: number, dy: number) => {
  const { bottom, left, right, top } = box
  if (dx === 0 && (x <= left - by || x >= right + by)) return Infinity
  if (dy === 0 && (y <= top - by || y >= bottom + by)) return Infinity
  const x1   = dx === 0 ? -Infinity : (left - by - x) / dx
  const x2   = dx === 0 ? Infinity : (right + by - x) / dx
  const y1   = dy === 0 ? -Infinity : (top - by - y) / dy
  const y2   = dy === 0 ? Infinity : (bottom + by - y) / dy
  const near = Math.max(0, Math.min(x1, x2), Math.min(y1, y2))
  const far  = Math.min(Math.max(x1, x2), Math.max(y1, y2))
  return near <= far ? near : Infinity
}

/**
 * Fills a disc `radius` pixels round at `x`, `y`.
 */
const discAt = (context: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()
}
