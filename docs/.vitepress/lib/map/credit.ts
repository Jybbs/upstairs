import type { Map } from 'maplibre-gl'

/**
 * One part of the fold, as the element it moves, its keyframes, and the
 * pseudo-element it moves in place of the element where it names one.
 */
type Part = [element: Element, keyframes: Keyframe[], pseudo?: string]

/**
 * A line or a heading of the open panel, with its top-left corner measured
 * from the panel's top-left corner.
 */
interface Row {
  element : HTMLElement
  height  : number
  left    : number
  top     : number
  width   : number
}

/**
 * The lines the map's credit adds beside the base map's own, each linking the
 * section of the Data page that lists its sources.
 */
export const CREDITS = [
  `<a href="${import.meta.env.BASE_URL}data/#orbits">Orbits from CelesTrak and Space-Track</a>`,
  `<a href="${import.meta.env.BASE_URL}data/#terrain">Terrain from Mapzen and its sources</a>`
]

/**
 * The groups of the open panel in reading order, each as its heading and the
 * links under it in the order `links` gives.
 */
export const GROUPS = [
  { heading: 'Sources', links: ['[href$="#orbits"]', '[href$="#terrain"]', '[href*="openstreetmap.org"]'] },
  { heading: 'Tiles', links: ['[href*="openfreemap.org"]', '[href*="openmaptiles.org"]'] }
]

/**
 * How long the credit stays open once the line `line` selects shows, and the
 * events on the map that close it sooner.
 */
export const HOLD = {
  events : ['keydown', 'pointerdown', 'wheel'],
  line   : 'a[href*="openstreetmap.org"]',
  wait   : 5000
}

/**
 * The fold's timing in milliseconds and its distances in pixels. Each line
 * leaves over `span` of the `fold`, the last done by `rows`, drifting `drift`
 * toward the ring, and the panel lands on the ring at `lands`. The ring then
 * swells to `swell` at `peak` of its `pulse` and sends out a halo `halo` wide.
 */
const MOTION = {
  drift : 10,
  fold  : 900,
  halo  : 12,
  lands : 0.84,
  peak  : 0.31,
  pulse : 380,
  rows  : 0.8,
  span  : 0.2,
  swell : 1.16
}

/**
 * Measures each line and heading of the open panel, sorted top to bottom and
 * then left to right.
 */
const rowsOf = (inner: HTMLElement): Row[] =>
  [...inner.querySelectorAll<HTMLElement>('a, .credit-heading')]
    .map(element => ({
      element : element,
      height  : element.offsetHeight,
      left    : inner.offsetLeft + element.offsetLeft,
      top     : inner.offsetTop + element.offsetTop,
      width   : element.offsetWidth
    }))
    .sort((one, two) => one.top - two.top || one.left - two.left)

/**
 * Folds the map's credit into the ring around its i and opens it back out,
 * playing the fold backward to open and swapping at once under reduced
 * motion, and reverses a motion from where it stands when the i is pressed
 * again partway through. Each time the map rewrites the credit's lines, it
 * moves them into the groups `GROUPS` sets.
 */
class Credit {
  private heading: boolean | null = null
  private moving: Animation[]     = []
  private readonly lines          = new MutationObserver(() => this.arrange())

  constructor(readonly details: HTMLElement, private readonly motion = MOTION) {
    details.addEventListener('click', this.pressed, { capture: true })
    this.lines.observe(this.inner, { childList: true })
    this.arrange()
  }

  get inner() {
    return this.details.querySelector<HTMLElement>('.maplibregl-ctrl-attrib-inner')!
  }

  get ring() {
    return this.details.querySelector<HTMLElement>('.maplibregl-ctrl-attrib-button')!
  }

  /**
   * Whether the credit is open, or opening where a motion is under way.
   */
  get open() {
    return this.heading ?? this.details.classList.contains('maplibregl-compact-show')
  }

  /**
   * Moves each link into its group under the group's heading, drops the text
   * between the links, and leaves out a group with no link shown. A link no
   * group names follows the groups.
   */
  private arrange() {
    const { inner } = this
    const links     = [...inner.querySelectorAll('a')]
    const groups    = GROUPS.flatMap(({ heading, links: picks }) => {
      const shown = picks.flatMap(pick => links.filter(link => link.matches(pick)))
      if (!shown.length) return []
      const group = document.createElement('div')
      const title = document.createElement('p')
      group.className   = 'credit-group'
      title.className   = 'credit-heading'
      title.textContent = heading
      group.append(title, ...shown)
      return [group]
    })
    inner.replaceChildren(...groups, ...links.filter(link => link.parentElement === inner))
    this.lines.takeRecords()
  }

  /**
   * Builds the fold of the open panel into the ring, each line leaving in
   * reading order as the panel's top-left corner follows the lines still left,
   * then the ring swelling once and sending out a halo as the panel lands.
   */
  private fold(): { duration: number, parts: Part[] } {
    const { details, inner, motion, ring } = this
    const { paddingLeft, paddingTop }      = getComputedStyle(details)
    const rows   = rowsOf(inner)
    const length = motion.fold * motion.lands + motion.pulse
    const scale  = motion.fold / length
    const step   = (motion.rows - motion.span) / Math.max(1, rows.length - 1)
    const landed = scale * motion.lands
    const color  = getComputedStyle(ring).color
    const glide  = 'cubic-bezier(.45,0,.35,1)'
    const inset  = { left: parseFloat(paddingLeft), top: parseFloat(paddingTop) }
    const gone   = (i: number) => (i * step + motion.span) * scale
    const limit  = {
      left : details.offsetWidth - ring.offsetWidth,
      top  : details.offsetHeight - ring.offsetHeight
    }
    const ringX = limit.left + ring.offsetWidth / 2
    const ringY = limit.top + ring.offsetHeight / 2
    const edge  = (kept: Row[], side: 'left' | 'top') =>
      `${Math.min(limit[side], Math.max(0, Math.min(...kept.map(row => row[side])) - inset[side]))}px`
    const halo = (spread: number, share: number) =>
      `inset 0 0 0 1.5px ${color}, 0 0 0 ${spread}px color-mix(in srgb, ${color} ${share}%, transparent)`
    const lines = rows.map((row, i): Part => {
      const dx    = ringX - row.left - row.width / 2
      const dy    = ringY - row.top - row.height / 2
      const reach = Math.hypot(dx, dy) || 1
      const moved = `${dx / reach * motion.drift}px ${dy / reach * motion.drift}px`
      return [row.element, [
        { offset: 0, opacity: 1, translate: '0 0' },
        { easing: 'cubic-bezier(.4,0,.8,.6)', offset: i * step * scale, opacity: 1, translate: '0 0' },
        { offset: gone(i), opacity: 0, translate: moved },
        { offset: 1, opacity: 0, translate: moved }
      ]]
    })
    const edges = rows.slice(1).map((_, i) => {
      const kept = rows.slice(i + 1)
      return { easing: glide, left: edge(kept, 'left'), offset: gone(i), top: edge(kept, 'top') }
    })
    const surface: Part = [details, [
      { easing: glide, left: '0px', offset: 0, top: '0px' },
      ...edges,
      { left: `${limit.left}px`, offset: landed, top: `${limit.top}px` },
      { left: `${limit.left}px`, offset: 1, top: `${limit.top}px` }
    ], '::before']
    const peak = landed + (1 - landed) * motion.peak
    return {
      duration : length,
      parts    : [...lines, surface, [ring, [
        { offset: 0, scale: 1 },
        { easing: 'cubic-bezier(.3,0,.3,1)', offset: landed, scale: 1 },
        { easing: 'cubic-bezier(.4,0,.2,1)', offset: peak, scale: motion.swell },
        { offset: 1, scale: 1 }
      ]], [ring, [
        { boxShadow: halo(0, 50), offset: 0 },
        { boxShadow: halo(0, 50), easing: 'cubic-bezier(.2,.6,.3,1)', offset: landed },
        { boxShadow: halo(motion.halo, 0), offset: 1 }
      ], '::after']]
    }
  }

  private pressed = (event: Event) => {
    if (!this.ring.contains(event.target as Node)) return
    event.preventDefault()
    event.stopPropagation()
    this.toggle(!this.open)
  }

  private settle() {
    for (const animation of this.moving) animation.cancel()
    this.show(this.heading!)
    this.moving  = []
    this.heading = null
    this.details.classList.remove('credit-moving')
  }

  private show(open: boolean) {
    this.details.classList.toggle('maplibregl-compact-show', open)
    this.details.toggleAttribute('open', open)
  }

  toggle(open: boolean) {
    if (open === this.open) return
    if (this.moving.length) {
      this.heading = open
      for (const animation of this.moving) animation.reverse()
      return
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return this.show(open)
    this.show(true)
    this.details.classList.add('credit-moving')
    const { duration, parts } = this.fold()
    const direction           = open ? 'reverse' : 'normal'
    this.heading              = open
    this.moving               = parts.map(([element, keyframes, pseudoElement]) =>
      element.animate(keyframes, { direction, duration, fill: 'both', pseudoElement }))
    Promise.all(this.moving.map(animation => animation.finished))
      .then(() => this.settle())
  }
}

/**
 * Keeps the map's credit open until the reader presses, scrolls, or types on
 * the map, or until `wait` milliseconds after the line `line` selects shows,
 * whichever comes first. Once the reader presses the credit itself, it stays as
 * the reader sets it until a drag of the map folds it.
 */
export const holdCredit = (map: Map, hold = HOLD, motion = MOTION) => {
  const credit = new Credit(map.getContainer().querySelector('.maplibregl-ctrl-attrib')!, motion)
  const held   = new AbortController()
  const close  = () => {
    held.abort()
    credit.toggle(false)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const start = () => {
    if (!credit.inner.querySelector(hold.line)) return
    lines.disconnect()
    timer = setTimeout(close, hold.wait)
  }
  const lines = new MutationObserver(start)
  held.signal.addEventListener('abort', () => {
    lines.disconnect()
    clearTimeout(timer)
  })
  lines.observe(credit.inner, { childList: true })
  start()
  map.on('dragstart', () => credit.toggle(false))
  map.once('remove', () => held.abort())
  for (const type of ['click', 'pointerdown']) {
    credit.details.addEventListener(type, () => held.abort(), { capture: true, signal: held.signal })
  }
  for (const type of hold.events) {
    map.getCanvasContainer().addEventListener(type, close, { signal: held.signal })
  }
}
