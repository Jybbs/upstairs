import { KINDS } from '../orbit/kinds.ts'
import { TRACK_STEP, type Spot } from '../orbit/scan.ts'
import type { Tracks } from '../state/tracks.ts'
import { View } from './mercator.ts'

export interface Label { name: string, latitude: number, longitude: number, tier: 'region' | 'city' | 'water' }

export interface Drawn {
  tracks   : Tracks
  spot     : Spot
  traced   : (pass: number) => boolean
  selected : number | null
}

const FAINT    = 'rgba(39, 54, 94, 0.5)'
const PAPER    = '#faf9f4'
const INK      = '#1d2430'
const MARK     = '#c2452d'
const MONO     = '"JetBrains Mono Variable", monospace'
const BOOK     = '"Literata Variable", serif'
const SHOWN    = 5
const OVERHEAD_KM  = 290
const PADDING  = 24
const REACH    = 16

/**
 * The two canvases above the map. The lower one holds what stays put between map
 * moves: place names, the spot, the paths. The upper one holds what moves with
 * the clock, and its loop makes no objects.
 */
export class Overlay {
  readonly view = new View()
  labels: readonly Label[] = []

  private still: CanvasRenderingContext2D
  private moving: CanvasRenderingContext2D
  private ratio = 1
  private hitX = new Float32Array(8192)
  private hitY = new Float32Array(8192)
  private hitPass = new Int32Array(8192)
  private hits = 0
  private topPass = new Int32Array(SHOWN)
  private topHeight = new Float32Array(SHOWN)
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

  /** The pass drawn nearest a pixel, or null when none is within reach. */
  nearest(x: number, y: number): number | null {
    let best: number | null = null, bestDistance = REACH * REACH
    for (let index = 0; index < this.hits; index++) {
      const dx = this.hitX[index] - x, dy = this.hitY[index] - y, distance = dx * dx + dy * dy
      if (distance < bestDistance) { bestDistance = distance; best = this.hitPass[index] }
    }
    return best
  }

  /** Marks every pass whose path above the horizon crosses the view. */
  crossing(tracks: Tracks): Uint8Array {
    const flags = new Uint8Array(tracks.passes.length)
    const { view } = this
    tracks.passes.forEach((pass, index) => {
      for (let at = pass.riseAt; at <= pass.setAt; at += TRACK_STEP) {
        if (tracks.sample(index, at / TRACK_STEP) && view.inside(view.column(tracks.longitude), view.row(tracks.latitude))) {
          flags[index] = 1
          return
        }
      }
    })
    return flags
  }

  draw(seconds: number) {
    if (this.staleStill) { this.drawStill(); this.staleStill = false }
    this.drawMoving(seconds)
  }

  private drawStill() {
    const { still: context, view, ratio } = this
    const state = this.drawn()
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, view.width, view.height)
    this.drawLabels(context)

    const { tracks } = state
    context.lineCap = 'round'
    for (let pass = 0; pass < tracks.passes.length; pass++) {
      const selected = tracks.passes[pass].id === state.selected
      if (state.traced(pass) && !selected) this.drawPath(context, tracks, pass, false)
    }
    const chosen = tracks.passes.findIndex(pass => pass.id === state.selected)
    if (chosen >= 0) this.drawPath(context, tracks, chosen, true)
    this.drawSpot(context, state.spot)
  }

  private drawLabels(context: CanvasRenderingContext2D) {
    const { view } = this
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineJoin = 'round'
    context.lineWidth = 3
    for (const label of this.labels) {
      const x = view.column(label.longitude), y = view.row(label.latitude)
      if (!view.inside(x, y, 40)) continue
      const text = label.tier === 'city' ? label.name : label.name.toUpperCase()
      context.letterSpacing = label.tier === 'region' ? '1.1px' : '0px'
      context.font = label.tier === 'city' ? `13px ${BOOK}` : label.tier === 'water' ? `italic 13px ${BOOK}` : `500 10.5px ${MONO}`
      context.strokeStyle = PAPER
      context.fillStyle = label.tier === 'water' ? '#27365e' : '#3a4150'
      context.strokeText(text, x, y)
      context.fillText(text, x, y)
    }
    context.letterSpacing = '0px'
  }

  private drawPath(context: CanvasRenderingContext2D, tracks: Tracks, pass: number, selected: boolean) {
    const { view } = this
    const { riseAt, setAt, kind } = tracks.passes[pass]
    context.strokeStyle = KINDS[kind].color
    context.globalAlpha = selected ? 1 : 0.42
    context.lineWidth = selected ? 2.4 : 1
    context.beginPath()
    let previousX = NaN, previousY = NaN, seen = false
    for (let at = riseAt; at <= setAt; at += TRACK_STEP) {
      if (!tracks.sample(pass, at / TRACK_STEP)) continue
      const x = view.column(tracks.longitude), y = view.row(tracks.latitude)
      const jump = Math.abs(x - previousX) > view.world / 2
      if (Number.isNaN(previousX) || jump) context.moveTo(x, y)
      else if (view.inside(x, y, 400) || view.inside(previousX, previousY, 400)) { context.lineTo(x, y); seen = true }
      else context.moveTo(x, y)
      previousX = x; previousY = y
    }
    if (seen) context.stroke()
    if (seen) this.drawArrow(context, tracks, pass, selected)
    context.globalAlpha = 1
  }

  /** A small open arrow at the middle of a path's stretch inside the view. */
  private drawArrow(context: CanvasRenderingContext2D, tracks: Tracks, pass: number, selected: boolean) {
    const { view } = this
    const { riseAt, setAt } = tracks.passes[pass]
    let first = -1, last = -1
    for (let index = riseAt / TRACK_STEP; index <= setAt / TRACK_STEP; index++) {
      if (!tracks.sample(pass, index) || !view.inside(view.column(tracks.longitude), view.row(tracks.latitude))) continue
      if (first < 0) first = index
      last = index
    }
    if (first < 0 || first === last) return
    const middle = Math.floor((first + last) / 2)
    if (!tracks.sample(pass, middle)) return
    const x = view.column(tracks.longitude), y = view.row(tracks.latitude)
    if (!tracks.sample(pass, middle + 1)) return
    const dx = view.column(tracks.longitude) - x, dy = view.row(tracks.latitude) - y
    const length = Math.hypot(dx, dy)
    if (length < 1 || length > view.world / 2) return
    const ux = dx / length, uy = dy / length, size = selected ? 8 : 5.5
    context.beginPath()
    context.moveTo(x - ux * size - uy * size * 0.7, y - uy * size + ux * size * 0.7)
    context.lineTo(x, y)
    context.lineTo(x - ux * size + uy * size * 0.7, y - uy * size - ux * size * 0.7)
    context.globalAlpha = selected ? 1 : 0.8
    context.stroke()
  }

  private drawSpot(context: CanvasRenderingContext2D, spot: Spot) {
    const { view } = this
    const x = view.column(spot.longitude), y = view.row(spot.latitude)
    const radius = OVERHEAD_KM * view.scale(spot.latitude)
    context.strokeStyle = INK
    context.globalAlpha = 0.55
    context.lineWidth = 1
    context.setLineDash([3, 4])
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke()
    context.setLineDash([])
    context.globalAlpha = 1
    if (radius > 56) {
      context.font = `500 10px ${MONO}`
      context.letterSpacing = '1px'
      context.textAlign = 'center'
      context.lineWidth = 3
      context.strokeStyle = PAPER
      context.fillStyle = INK
      context.strokeText('60° UP AT 550 KM', x, y - radius - 8)
      context.fillText('60° UP AT 550 KM', x, y - radius - 8)
      context.letterSpacing = '0px'
    }
    context.fillStyle = MARK
    context.strokeStyle = PAPER
    context.lineWidth = 2
    context.beginPath(); context.arc(x, y, 5.5, 0, Math.PI * 2); context.fill(); context.stroke()
  }

  private drawMoving(seconds: number) {
    const { moving: context, view, ratio, topPass, topHeight } = this
    const state = this.drawn()
    const { tracks } = state
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, view.width, view.height)
    topPass.fill(-1); topHeight.fill(-1)
    this.hits = 0
    let chosen = -1

    context.fillStyle = FAINT
    for (let pass = 0; pass < tracks.passes.length; pass++) {
      if (!tracks.at(pass, seconds) || tracks.elevation <= 0) continue
      const x = view.column(tracks.longitude), y = view.row(tracks.latitude)
      if (!view.inside(x, y, PADDING)) continue
      this.remember(x, y, pass)
      if (state.traced(pass)) {
        const height = tracks.elevation
        if (tracks.passes[pass].id === state.selected) chosen = pass
        else this.rank(pass, height)
      } else {
        context.fillRect(x - 1.25, y - 1.25, 2.5, 2.5)
      }
    }

    for (let pass = 0; pass < tracks.passes.length; pass++) {
      if (!state.traced(pass) || !tracks.at(pass, seconds) || tracks.elevation <= 0) continue
      this.drawMark(context, tracks, pass, seconds, tracks.passes[pass].id === state.selected)
    }

    for (let index = 0; index < SHOWN; index++) {
      if (topPass[index] >= 0) this.drawName(context, tracks, topPass[index], seconds, false)
    }
    if (chosen >= 0) this.drawName(context, tracks, chosen, seconds, true)
  }

  private remember(x: number, y: number, pass: number) {
    if (this.hits === this.hitX.length) return
    this.hitX[this.hits] = x; this.hitY[this.hits] = y; this.hitPass[this.hits] = pass
    this.hits++
  }

  /** Keeps the highest few passes without sorting or allocating. */
  private rank(pass: number, height: number) {
    const { topPass, topHeight } = this
    let lowest = 0
    for (let index = 1; index < SHOWN; index++) if (topHeight[index] < topHeight[lowest]) lowest = index
    if (height > topHeight[lowest]) { topHeight[lowest] = height; topPass[lowest] = pass }
  }

  /** A pointed mark along the direction of travel, or a dot for what holds its place. */
  private drawMark(context: CanvasRenderingContext2D, tracks: Tracks, pass: number, seconds: number, selected: boolean) {
    const { view } = this
    const x = view.column(tracks.longitude), y = view.row(tracks.latitude)
    if (!view.inside(x, y, PADDING)) return
    const nextAt = Math.min(seconds + TRACK_STEP, (tracks.samples - 1) * TRACK_STEP)
    let dx = 0, dy = 0
    if (tracks.at(pass, nextAt)) { dx = view.column(tracks.longitude) - x; dy = view.row(tracks.latitude) - y }
    const length = Math.hypot(dx, dy)
    const size = selected ? 8 : 5.5
    context.fillStyle = KINDS[tracks.passes[pass].kind].color
    context.strokeStyle = PAPER
    context.lineWidth = selected ? 1.6 : 1
    context.beginPath()
    if (length < 0.5) {
      context.arc(x, y, size * 0.65, 0, Math.PI * 2)
    } else {
      const ux = dx / length, uy = dy / length
      context.moveTo(x + ux * size * 1.25, y + uy * size * 1.25)
      context.lineTo(x - ux * size * 0.8 - uy * size * 0.72, y - uy * size * 0.8 + ux * size * 0.72)
      context.lineTo(x - ux * size * 0.35, y - uy * size * 0.35)
      context.lineTo(x - ux * size * 0.8 + uy * size * 0.72, y - uy * size * 0.8 - ux * size * 0.72)
      context.closePath()
    }
    context.fill(); context.stroke()
  }

  private drawName(context: CanvasRenderingContext2D, tracks: Tracks, pass: number, seconds: number, selected: boolean) {
    const { view } = this
    if (!tracks.at(pass, seconds)) return
    const x = view.column(tracks.longitude), y = view.row(tracks.latitude)
    context.font = `${selected ? 600 : 500} ${selected ? 11.5 : 10}px ${MONO}`
    context.letterSpacing = '0.9px'
    context.textAlign = x > view.width - 130 ? 'right' : 'left'
    context.textBaseline = 'middle'
    context.lineJoin = 'round'
    context.lineWidth = 3
    context.strokeStyle = PAPER
    context.fillStyle = INK
    const textX = x + (x > view.width - 130 ? -11 : 11)
    context.strokeText(tracks.passes[pass].name, textX, y)
    context.fillText(tracks.passes[pass].name, textX, y)
    context.letterSpacing = '0px'
  }
}
