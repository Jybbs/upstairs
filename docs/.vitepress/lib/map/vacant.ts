import type { Kind }            from '../orbit/kinds.ts'
import { morseOf }              from '../site/footnotes.ts'
import { GRID, iconOf }         from '../site/icons.ts'
import { clamp }                from '../site/motion.ts'
import { SCHEMES, type Scheme } from '../site/palette.ts'
import type { Room }            from './numeral.ts'

/**
 * The edges of a box in pixels, as `getBoundingClientRect` returns them.
 */
type Edges = Pick<DOMRectReadOnly, 'bottom' | 'left' | 'right' | 'top'>

/**
 * A ground track drawn across the map: the share of the map's height it
 * centers on, its swing as a share of that height, the waves it makes across
 * the map, its phase, and the share of the width its satellite moves each
 * second.
 */
interface Track {
  at    : number
  kind  : Kind
  phase : number
  speed : number
  swing : number
  waves : number
}

/**
 * The dashes of the ring while no pass has reached the spot.
 */
const DASH = [4, 5]
/**
 * The radius in pixels of each track's satellite.
 */
const DOT = 5
/**
 * The empty dash pattern, under which a line is drawn solid.
 */
const LINE: number[] = []
/**
 * The pass the ring calls: the seconds it takes to cross the map, the pixels
 * past each edge it starts and ends, how far it bends from a straight line and
 * how far it climbs across the map as shares of the map's height, and its
 * satellite's radius.
 */
const PASS = { bow: 0.35, climb: 0.3, edge: 12, radius: 6, seconds: 4.2 } as const
/**
 * The ring round the spot: the space in pixels it keeps from every track and
 * from the edges of its room, its largest radius, and the step in pixels its
 * search for the spot takes.
 */
const RING = { clear: 14, most: 120, step: 8 } as const
/**
 * The spacing in pixels of the samples a track is drawn and searched through.
 */
const SAMPLE = 6
/**
 * The widths in pixels of each track, of the navigation track's hairline, and
 * of the ring dashed and solid, the opacity of the ring's halo, and the size
 * in pixels of the mark of the spot.
 */
const STROKE = { dashed: 1.5, hair: 0.75, halo: 0.55, mark: 28, solid: 2.5, track: 2 } as const
/**
 * The ground tracks crossing the map, one per kind, the navigation track keyed
 * in Morse.
 */
export const TRACKS: readonly Track[] = [
  { at: 0.30, kind: 'crewed', phase: 0.10, speed: 0.020, swing: 0.24, waves: 1.0 },
  { at: 0.55, kind: 'earth', phase: 0.62, speed: 0.016, swing: 0.34, waves: 1.3 },
  { at: 0.50, kind: 'navigation', phase: 0.35, speed: 0.011, swing: 0.12, waves: 0.6 },
  { at: 0.72, kind: 'comms', phase: 0.85, speed: 0.024, swing: 0.20, waves: 1.6 },
  { at: 0.42, kind: 'weather', phase: 0.20, speed: 0.014, swing: 0.30, waves: 0.9 }
]
/**
 * The pixels one Morse unit takes along the navigation track. A dot takes one
 * unit and a dash three, with a gap of one unit inside a letter, three between
 * letters, and seven before the word repeats, per ITU-R M.1677-1.
 */
const UNIT = 4
/**
 * 404 in Morse, one character per mark and one space per unit of gap.
 */
const spelled = morseOf('404')

/**
 * Finds the point of `room` farthest from every track and from the room's
 * edges on a map `width` by `height` pixels, and that distance.
 */
const clearestIn = (room: Room, width: number, height: number) => {
  const samples = Math.ceil(width / SAMPLE) + 1
  const xs      = new Float32Array(samples * TRACKS.length)
  const ys      = new Float32Array(samples * TRACKS.length)
  TRACKS.forEach((track, index) => {
    for (let sample = 0; sample < samples; sample++) {
      const x                      = Math.min(sample * SAMPLE, width)
      xs[index * samples + sample] = x
      ys[index * samples + sample] = heightOf(track, x / width, height)
    }
  })
  let best = { gap: 0, x: room.left + room.width / 2, y: room.top + room.height / 2 }
  for (let x = room.left; x <= room.left + room.width; x += RING.step) {
    for (let y = room.top; y <= room.top + room.height; y += RING.step) {
      let gap = Math.min(x - room.left, room.left + room.width - x, y - room.top, room.top + room.height - y)
      for (let index = 0; index < xs.length && gap > best.gap; index++) {
        gap = Math.min(gap, Math.hypot(xs[index] - x, ys[index] - y))
      }
      if (gap > best.gap) best = { gap, x, y }
    }
  }
  return best
}

/**
 * Returns the curve `heightAt` draws as an SVG path through a sample every
 * `SAMPLE` pixels from `from` to `to`.
 */
const pathOf = (heightAt: (x: number) => number, from: number, to: number) => {
  let path = ''
  for (let x = from; x < to + SAMPLE; x += SAMPLE) {
    path += `${x === from ? 'M' : 'L'}${x} ${heightAt(x).toFixed(1)}`
  }
  return path
}

/**
 * Returns the height in pixels a track stands at `share` of the way across a
 * map `height` pixels tall.
 */
export const heightOf = (track: Track, share: number, height: number) =>
  height * (track.at + track.swing * Math.sin(2 * Math.PI * (share * track.waves + track.phase)))

/**
 * Returns the Morse marks along a track as two SVG paths, the dots as discs
 * one unit across and the dashes as lines whose round caps carry them to three
 * units, each placed by distance along the curve so every mark keeps its
 * length.
 */
export const keyedOf = (track: Track, width: number, height: number) => {
  const lengths = new Float32Array(width + 1)
  const ys      = new Float32Array(width + 1)
  ys[0]         = heightOf(track, 0, height)
  for (let x = 1; x <= width; x++) {
    ys[x]      = heightOf(track, x / width, height)
    lengths[x] = lengths[x - 1] + Math.hypot(1, ys[x] - ys[x - 1])
  }
  let x         = 0
  const pointAt = (distance: number) => {
    while (x < width - 1 && lengths[x + 1] < distance) x++
    const share = (distance - lengths[x]) / (lengths[x + 1] - lengths[x])
    return `${(x + share).toFixed(2)} ${(ys[x] + share * (ys[x + 1] - ys[x])).toFixed(2)}`
  }
  const half = UNIT / 2
  const disc = `a${half} ${half} 0 1 0 ${UNIT} 0a${half} ${half} 0 1 0 ${-UNIT} 0`
  let dashes = ''
  let dots   = ''
  for (const [from, to] of keysAlong(lengths[width])) {
    if (to - from > UNIT) dashes += `M${pointAt(from + half)}L${pointAt(to - half)}`
    else dots += `M${pointAt(from + half)}m${-half} 0${disc}`
  }
  return { dashes, dots }
}

/**
 * Returns the start and end in pixels of every Morse mark spelling 404 over and
 * over along a line `length` pixels long, from its start, keeping only the
 * marks that fit whole.
 */
export const keysAlong = (length: number) => {
  const keys: [number, number][] = []
  for (let at = 0; ;) {
    for (const symbol of spelled) {
      const end = at + (symbol === '-' ? 3 : 1) * UNIT
      if (symbol !== ' ') {
        if (end > length) return keys
        keys.push([at, end])
      }
      at = end
    }
  }
}

/**
 * Returns the room of `frame` its `covers` leave open, in the frame's own
 * pixels, cutting the frame off at the top of each cover that overlaps it.
 */
export const roomOf = (frame: Edges, ...covers: Edges[]): Room => {
  let bottom = frame.bottom
  for (const { left, right, top, bottom: foot } of covers) {
    if (left < frame.right && right > frame.left && top < bottom && foot > frame.top) {
      bottom = Math.max(top, frame.top)
    }
  }
  return { height: bottom - frame.top, left: 0, top: 0, width: frame.right - frame.left }
}

/**
 * The canvas over the map on the not-found page: a ground track per kind
 * with its satellite moving along it, the navigation track keyed in Morse, the
 * ring round a spot no track crosses, and the one pass the ring calls, drawn
 * in behind its satellite. Its loop makes no objects.
 */
export class VacantSky {
  /**
   * The ring's center and radius in pixels, all zero until the first resize.
   */
  readonly ring    = { radius: 0, x: 0, y: 0 }
  /**
   * Whether the device asks for reduced motion, under which every satellite
   * holds still and the called pass stands at the spot at once.
   */
  reduced          = false
  scheme: Scheme   = SCHEMES.day

  private context: CanvasRenderingContext2D
  private called   = -1
  private elapsed  = 0
  private height   = 0
  private keyed    = { dashes: new Path2D(), dots: new Path2D() }
  private pass     = new Path2D()
  private place    = new Path2D(iconOf('place', STROKE.mark))
  private ratio    = 1
  private tracks   = TRACKS.map(() => new Path2D())
  private width    = 0

  constructor(canvas: HTMLCanvasElement) { this.context = canvas.getContext('2d')! }

  /**
   * Whether the called pass has reached the spot.
   */
  get crossed(): boolean { return this.called >= 0 && this.passX >= this.ring.x }

  /**
   * The column the called pass's satellite stands at.
   */
  private get passX(): number {
    if (this.reduced) return this.ring.x
    const share = clamp((this.elapsed - this.called) / PASS.seconds, 0, 1)
    return share * (this.width + 2 * PASS.edge) - PASS.edge
  }

  /**
   * Returns the height in pixels of the called pass at `x`, an arc through the
   * ring's center that climbs to the right of it.
   */
  private passHeightAt(x: number) {
    const { height, ring, width } = this
    const off                     = (x - ring.x) / width
    return ring.y - off * height * PASS.climb - off * off * height * PASS.bow
  }

  /**
   * Sizes the canvas to a map `width` by `height` pixels, laying out every
   * track and setting the ring where it stands farthest from them in `room`.
   */
  resize(width: number, height: number, ratio: number, room: Room) {
    this.width                  = width
    this.height                 = height
    this.ratio                  = ratio
    this.context.canvas.width   = Math.round(width * ratio)
    this.context.canvas.height  = Math.round(height * ratio)
    this.tracks                 = TRACKS.map(track =>
      new Path2D(pathOf(x => heightOf(track, x / width, height), 0, width)))
    const keyed                 = keyedOf(TRACKS.find(({ kind }) => kind === 'navigation')!, width, height)
    this.keyed                  = { dashes: new Path2D(keyed.dashes), dots: new Path2D(keyed.dots) }
    const { gap, x, y }         = clearestIn(room, width, height)
    Object.assign(this.ring, { radius: clamp(gap - RING.clear, 0, RING.most), x, y })
    this.pass                   = new Path2D(
      pathOf(along => this.passHeightAt(along), -PASS.edge, width + PASS.edge))
  }

  /**
   * Calls the pass from the map's left edge, or lets it go again.
   */
  call(on: boolean) { this.called = on ? this.elapsed : -1 }

  /**
   * Moves the clock `seconds` on, holding it under reduced motion, and draws
   * the frame.
   */
  draw(seconds: number) {
    if (!this.reduced) this.elapsed += seconds
    const { context, ratio, scheme } = this
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, this.width, this.height)
    context.lineCap = 'round'
    TRACKS.forEach(this.drawTrack)
    this.drawRing()
    if (this.called >= 0) this.drawPass()
    context.strokeStyle = scheme.halo
    for (let index = 0; index < TRACKS.length; index++) {
      const track         = TRACKS[index]
      const share         = (track.phase + this.elapsed * track.speed) % 1
      context.fillStyle   = scheme.kinds[track.kind]
      this.discAt(share * this.width, heightOf(track, share, this.height), DOT)
    }
  }

  /**
   * Draws a track, the navigation track as a hairline under its Morse marks.
   */
  private readonly drawTrack = (track: Track, index: number) => {
    const { context } = this
    const keyed       = track.kind === 'navigation'
    context.strokeStyle = this.scheme.kinds[track.kind]
    context.lineWidth   = keyed ? STROKE.hair : STROKE.track
    context.stroke(this.tracks[index])
    if (!keyed) return
    context.fillStyle = this.scheme.kinds[track.kind]
    context.lineWidth = UNIT
    context.stroke(this.keyed.dashes)
    context.fill(this.keyed.dots)
  }

  /**
   * Draws the ring over its halo, dashed until the called pass reaches the
   * spot, round the mark of the spot.
   */
  private drawRing() {
    const { context, ratio, ring, scheme } = this
    if (!ring.radius) return
    const crossed       = this.crossed
    context.beginPath()
    context.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2)
    context.globalAlpha = STROKE.halo
    context.fillStyle   = scheme.halo
    context.fill()
    context.globalAlpha = 1
    context.strokeStyle = scheme.spot
    context.lineWidth   = crossed ? STROKE.solid : STROKE.dashed
    context.setLineDash(crossed ? LINE : DASH)
    context.stroke()
    context.setLineDash(LINE)
    const scale         = STROKE.mark / GRID
    const half          = STROKE.mark / 2
    context.fillStyle   = scheme.spot
    context.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * (ring.x - half), ratio * (ring.y - half))
    context.fill(this.place)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  /**
   * Draws the called pass's track up to its satellite, then the satellite.
   */
  private drawPass() {
    const { context, scheme } = this
    const x                   = this.passX
    context.strokeStyle       = scheme.kinds.science
    context.lineWidth         = STROKE.track
    context.save()
    context.beginPath()
    context.rect(-PASS.edge, 0, x + PASS.edge, this.height)
    context.clip()
    context.stroke(this.pass)
    context.restore()
    context.fillStyle   = scheme.kinds.science
    context.strokeStyle = scheme.halo
    this.discAt(x, this.passHeightAt(x), PASS.radius)
  }

  /**
   * Fills a disc `radius` pixels round at `x`, `y`, ringed by a halo stroke.
   */
  private discAt(x: number, y: number, radius: number) {
    const { context } = this
    context.lineWidth = 2
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }
}
