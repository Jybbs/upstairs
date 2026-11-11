import { AGES, DAY }                        from '../orbit/catalog.ts'
import { KINDS }                            from '../orbit/kinds.ts'
import { TRACK_STEP, type Pass, type Spot } from '../orbit/scan.ts'
import type { Tracks }                      from '../state/tracks.ts'
import { View }                             from './mercator.ts'

export interface Drawn {
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

const BOOK        = '"Literata Variable", serif'
const DOT_GAP     = 4.5
const DRIFT_KM    = 5
const DRIFT_PX    = 10
const FAINT       = 'rgba(39, 54, 94, 0.5)'
const INK         = '#1d2430'
const MARK        = '#c2452d'
const MONO        = '"JetBrains Mono Variable", monospace'
const OVERHEAD_KM = 290
const PADDING     = 24
const PAPER       = '#faf9f4'
const REACH       = 16
const SHOWN       = 5
const FONTS = {
  chosen : `600 11.5px ${MONO}`,
  city   : `13px ${BOOK}`,
  name   : `500 10px ${MONO}`,
  region : `500 10.5px ${MONO}`,
  water  : `italic 13px ${BOOK}`
}

/**
 * How many times `DOT_GAP` the ring's dots stand apart round a satellite whose
 * element set is `age` days past its epoch, once within a day of it, twice
 * until positions may drift, and three times after.
 */
const spreadOf = (age: number) => age > AGES.warn ? 3 : age > 1 ? 2 : 1

/**
 * The two canvases above the map. The lower one holds what stays put between
 * map moves: place names, the spot, the paths. The upper one holds what moves
 * with the clock, and its loop makes no objects.
 */
export class Overlay {
  readonly view            = new View()
  labels: readonly Label[] = []

  private still: CanvasRenderingContext2D
  private moving: CanvasRenderingContext2D
  private ratio      = 1
  private hitX       = new Float32Array(8192)
  private hitY       = new Float32Array(8192)
  private hitPass    = new Int32Array(8192)
  private hits       = 0
  private topPass    = new Int32Array(SHOWN)
  private topHeight  = new Float32Array(SHOWN)
  private dots       = [0, 0]
  private staleStill = true

  constructor(stillCanvas: HTMLCanvasElement, movingCanvas: HTMLCanvasElement, private drawn: () => Drawn) {
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
    const { ratio, still: context, view } = this
    const state                           = this.drawn()
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, view.width, view.height)
    this.drawLabels(context)

    const { tracks } = state
    context.lineCap  = 'round'
    const chosen     = state.selected ? tracks.passes.indexOf(state.selected) : -1
    for (let pass = 0; pass < tracks.passes.length; pass++) {
      if (pass !== chosen && state.traced(pass)) this.drawPath(context, tracks, pass, false)
    }
    if (chosen >= 0) this.drawPath(context, tracks, chosen, true)
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
      context.strokeStyle   = PAPER
      context.fillStyle     = label.tier === 'water' ? '#27365e' : '#3a4150'
      context.strokeText(text, x, y)
      context.fillText(text, x, y)
    }
    context.letterSpacing = '0px'
  }

  private drawPath(context: CanvasRenderingContext2D, tracks: Tracks, pass: number, selected: boolean) {
    const { view }                = this
    const { kind, riseAt, setAt } = tracks.passes[pass]
    context.strokeStyle           = KINDS[kind].color
    context.globalAlpha           = selected ? 1 : 0.42
    context.lineWidth             = selected ? 2.4 : 1
    context.beginPath()
    let previousX = NaN
    let previousY = NaN
    let seen      = false
    for (let at = riseAt; at <= setAt; at += TRACK_STEP) {
      if (!tracks.sample(pass, at / TRACK_STEP)) continue
      const x    = view.column(tracks.longitude)
      const y    = view.row(tracks.latitude)
      const jump = Math.abs(x - previousX) > view.world / 2
      if (Number.isNaN(previousX) || jump) context.moveTo(x, y)
      else if (view.crosses(previousX, previousY, x, y)) {
        context.lineTo(x, y)
        seen = true
      } else context.moveTo(x, y)
      previousX = x
      previousY = y
    }
    if (seen) context.stroke()
    if (seen) this.drawArrow(context, tracks, pass, selected)
    context.globalAlpha = 1
  }

  /**
   * Draws a small open arrow at the middle of a path's stretch inside the view.
   */
  private drawArrow(context: CanvasRenderingContext2D, tracks: Tracks, pass: number, selected: boolean) {
    const { view }          = this
    const { riseAt, setAt } = tracks.passes[pass]
    let first               = -1
    let last                = -1
    for (let index = riseAt / TRACK_STEP; index <= setAt / TRACK_STEP; index++) {
      if (!tracks.sample(pass, index)) continue
      if (!view.inside(view.column(tracks.longitude), view.row(tracks.latitude))) continue
      if (first < 0) first = index
      last = index
    }
    if (first < 0 || first === last) return
    const middle = Math.floor((first + last) / 2)
    if (!tracks.sample(pass, middle)) return
    const x = view.column(tracks.longitude)
    const y = view.row(tracks.latitude)
    if (!tracks.sample(pass, middle + 1)) return
    const dx     = view.column(tracks.longitude) - x
    const dy     = view.row(tracks.latitude) - y
    const length = Math.hypot(dx, dy)
    if (length < 1 || length > view.world / 2) return
    const ux   = dx / length
    const uy   = dy / length
    const size = selected ? 8 : 5.5
    context.beginPath()
    context.moveTo(x - ux * size - uy * size * 0.7, y - uy * size + ux * size * 0.7)
    context.lineTo(x, y)
    context.lineTo(x - ux * size + uy * size * 0.7, y - uy * size - ux * size * 0.7)
    context.globalAlpha = selected ? 1 : 0.8
    context.stroke()
  }

  private drawSpot(context: CanvasRenderingContext2D, spot: Spot) {
    const { view }      = this
    const x             = view.column(spot.longitude)
    const y             = view.row(spot.latitude)
    const radius        = OVERHEAD_KM * view.scale(spot.latitude)
    context.strokeStyle = INK
    context.globalAlpha = 0.55
    context.lineWidth   = 1
    context.setLineDash([3, 4])
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.stroke()
    context.setLineDash([])
    context.globalAlpha = 1
    if (radius > 56) {
      context.font          = FONTS.name
      context.letterSpacing = '1px'
      context.textAlign     = 'center'
      context.lineWidth     = 3
      context.strokeStyle   = PAPER
      context.fillStyle     = INK
      context.strokeText('60° UP AT 550 KM', x, y - radius - 8)
      context.fillText('60° UP AT 550 KM', x, y - radius - 8)
      context.letterSpacing = '0px'
    }
    context.fillStyle   = MARK
    context.strokeStyle = PAPER
    context.lineWidth   = 2
    context.beginPath()
    context.arc(x, y, 5.5, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }

  private drawMoving(seconds: number) {
    const { moving: context, ratio, topHeight, topPass, view } = this
    const state                                                = this.drawn()
    const { tracks }                                           = state
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, view.width, view.height)
    topPass.fill(-1)
    topHeight.fill(-1)
    this.hits  = 0
    let chosen = -1

    context.fillStyle = FAINT
    for (let pass = 0; pass < tracks.passes.length; pass++) {
      if (!tracks.up(pass, seconds)) continue
      const x = view.column(tracks.longitude)
      const y = view.row(tracks.latitude)
      if (!view.inside(x, y, PADDING)) continue
      this.remember(x, y, pass)
      if (state.traced(pass)) {
        const height = tracks.elevation
        if (tracks.passes[pass] === state.selected) chosen = pass
        else this.rank(pass, height)
      } else {
        context.fillRect(x - 1.25, y - 1.25, 2.5, 2.5)
      }
    }

    if (chosen >= 0 && tracks.up(chosen, seconds)) {
      this.drawRing(context, tracks, chosen, state.start + seconds * 1000)
    }
    for (let pass = 0; pass < tracks.passes.length; pass++) {
      if (!state.traced(pass) || !tracks.up(pass, seconds)) continue
      this.drawMark(context, tracks, pass, seconds, tracks.passes[pass] === state.selected)
    }

    for (let index = 0; index < SHOWN; index++) {
      if (topPass[index] >= 0) this.drawName(context, tracks, topPass[index], seconds, false)
    }
    if (chosen >= 0) this.drawName(context, tracks, chosen, seconds, true)
  }

  /**
   * Draws a dotted ring `DRIFT_KM` out round the chosen satellite in its kind's
   * color, once that distance spans `DRIFT_PX` at its latitude, its dots
   * spread by `spreadOf` the age of the satellite's element set at `time`.
   */
  private drawRing(context: CanvasRenderingContext2D, tracks: Tracks, pass: number, time: number) {
    const { dots, view } = this
    const radius         = DRIFT_KM * view.scale(tracks.latitude)
    if (radius < DRIFT_PX) return
    const around = 2 * Math.PI * radius
    const spread = spreadOf((time - tracks.passes[pass].epoch) / DAY)
    dots[1]      = around / Math.round(around / (DOT_GAP * spread))
    context.save()
    context.setLineDash(dots)
    context.beginPath()
    context.arc(view.column(tracks.longitude), view.row(tracks.latitude), radius, 0, Math.PI * 2)
    context.lineCap     = 'round'
    context.globalAlpha = 0.7
    context.strokeStyle = PAPER
    context.lineWidth   = 5.25
    context.stroke()
    context.globalAlpha = 1
    context.strokeStyle = KINDS[tracks.passes[pass].kind].color
    context.lineWidth   = 2.25
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

  /**
   * Keeps the highest few passes without sorting or allocating.
   */
  private rank(pass: number, height: number) {
    const { topHeight, topPass } = this
    let lowest                   = 0
    for (let index = 1; index < SHOWN; index++) if (topHeight[index] < topHeight[lowest]) lowest = index
    if (height > topHeight[lowest]) {
      topHeight[lowest] = height
      topPass[lowest]   = pass
    }
  }

  /**
   * Draws a pointed mark along the direction of travel, or a dot for what holds
   * its place.
   */
  private drawMark(
    context  : CanvasRenderingContext2D,
    tracks   : Tracks,
    pass     : number,
    seconds  : number,
    selected : boolean
  ) {
    const { view } = this
    const x        = view.column(tracks.longitude)
    const y        = view.row(tracks.latitude)
    if (!view.inside(x, y, PADDING)) return
    const nextAt = Math.min(seconds + TRACK_STEP, (tracks.samples - 1) * TRACK_STEP)
    let dx       = 0
    let dy       = 0
    if (tracks.at(pass, nextAt)) {
      dx = view.column(tracks.longitude) - x
      dy = view.row(tracks.latitude) - y
    }
    const length        = Math.hypot(dx, dy)
    const size          = selected ? 8 : 5.5
    context.fillStyle   = KINDS[tracks.passes[pass].kind].color
    context.strokeStyle = PAPER
    context.lineWidth   = selected ? 1.6 : 1
    context.beginPath()
    if (length < 0.5) {
      context.arc(x, y, size * 0.65, 0, Math.PI * 2)
    } else {
      const ux = dx / length
      const uy = dy / length
      context.moveTo(x + ux * size * 1.25, y + uy * size * 1.25)
      context.lineTo(x - ux * size * 0.8 - uy * size * 0.72, y - uy * size * 0.8 + ux * size * 0.72)
      context.lineTo(x - ux * size * 0.35, y - uy * size * 0.35)
      context.lineTo(x - ux * size * 0.8 + uy * size * 0.72, y - uy * size * 0.8 - ux * size * 0.72)
      context.closePath()
    }
    context.fill()
    context.stroke()
  }

  private drawName(
    context  : CanvasRenderingContext2D,
    tracks   : Tracks,
    pass     : number,
    seconds  : number,
    selected : boolean
  ) {
    const { view } = this
    if (!tracks.at(pass, seconds)) return
    const x               = view.column(tracks.longitude)
    const y               = view.row(tracks.latitude)
    context.font          = selected ? FONTS.chosen : FONTS.name
    context.letterSpacing = '0.9px'
    context.textAlign     = x > view.width - 130 ? 'right' : 'left'
    context.textBaseline  = 'middle'
    context.lineJoin      = 'round'
    context.lineWidth     = 3
    context.strokeStyle   = PAPER
    context.fillStyle     = INK
    const textX           = x + (x > view.width - 130 ? -11 : 11)
    context.strokeText(tracks.passes[pass].name, textX, y)
    context.fillText(tracks.passes[pass].name, textX, y)
    context.letterSpacing = '0px'
  }
}
