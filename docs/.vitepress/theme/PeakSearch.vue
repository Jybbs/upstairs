<script setup lang="ts">
/**
 * Draws a pass of the space station sampled at a spacing the reader drags along
 * a scale under it, with the band between the highest sample and the peak
 * opening as the samples spread. A drag keeps the knob under the pointer while
 * the samples trail it, and a release lets the knob coast onto the nearest
 * stop, each frame writing into the nodes the drawing made when it last fit.
 */
import { useElementSize, useIntersectionObserver, usePreferredReducedMotion } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, useId, watch }                       from 'vue'

import { GRID_STEP, TRACK_STEP } from '../lib/orbit/scan.ts'
import { clamp, Spring }         from '../lib/site/motion.ts'
import { pathOf }                from '../lib/site/paths.ts'
import { Slider }                from '../lib/site/slider.ts'
import { useDrawings }           from '../lib/state/drawings.ts'
import Readings                  from './Readings.vue'

const CARRY  = 0.12
const FLING  = 6
const FOLLOW = 28
const INSET  = 16
const LAND   = 22
const RADIUS = 3.5
const STOPS  = [10, 15, 20, TRACK_STEP, 45, 60, 90, GRID_STEP, 180, 240]
const LAST   = STOPS.length - 1
const NAMES  = STOPS.map(step => step < 60 ? `${step} S` : `${step / 60} MIN`)

const clip     = `peak-${useId()}`
const drawings = useDrawings()
const frame    = ref<HTMLElement>()
const gap      = ref<SVGRectElement>()
const handle   = ref<SVGGElement>()
const level    = ref<SVGLineElement>()
const missed   = ref('')
const nudging  = ref(false)
const samples  = ref<SVGGElement>()
const summit   = ref<SVGCircleElement>()
const motion   = usePreferredReducedMotion()
const size     = useElementSize(frame)
const width    = computed(() => Math.round(size.width.value))

/**
 * Reads the scanned pass at every stop, meaning the time of its highest sample,
 * how far that sample falls below the peak, and the ranks of the samples on
 * either side of it that any stop takes.
 */
const scale = computed(() => {
  const pass = drawings.value?.scanned
  if (!pass) return null
  const tops   = STOPS.map(step => pass.highest(step))
  const misses = STOPS.map(step => pass.miss(step))
  const ranks  = STOPS.map((step, index) => {
    const times = pass.comb(step)
    const top   = times.indexOf(tops[index])
    return [-top, times.length - 1 - top]
  })
  const low = Math.min(...ranks.map(([first]) => first))
  return {
    count  : Math.max(...ranks.map(([, last]) => last)) - low + 1,
    exact  : misses.map(degrees),
    low    : low,
    misses : misses,
    pass   : pass,
    tops   : tops,
    words  : Array.from({ length: Math.ceil(Math.max(...misses) * 100) + 2 }, (_, at) => degrees(at / 100))
  }
})

const layout = computed(() => {
  const pass = scale.value?.pass
  if (!pass || !width.value) return null
  const full    = width.value
  const tall    = Math.round(clamp(full * 0.46, 250, 300)) + 8
  const box     = {
    bottom : tall - 74,
    height : tall - 108,
    left   : 4,
    right  : full - 4,
    top    : 34,
    width  : full - 8
  }
  const ceiling = Math.ceil(pass.pass.peak / 10) * 10
  const span    = box.width / (pass.to - pass.from)
  const x       = (time: number) => box.left + (time - pass.from) * span
  const y       = (elevation: number) => box.bottom - elevation / ceiling * box.height
  const curve   = Array.from(pass.curve, (elevation, index): [number, number] =>
    [x(pass.from + index * 1000), y(elevation)]).filter((_, index) => pass.curve[index] >= 0)
  return {
    along : (stop: number) => INSET + stop / LAST * (full - 2 * INSET),
    below : tall - 48,
    box   : box,
    curve : pathOf(curve),
    full  : full,
    peak  : { x: x(pass.pass.peakAt), y: y(pass.pass.peak) },
    tall  : tall,
    x     : x,
    y     : y
  }
})

const slider = computed(() => new Slider(STOPS.length, STOPS.indexOf(TRACK_STEP), pick, moved))
const dots   = computed(() => Array.from({ length: scale.value?.count ?? 0 }, () => new Spring()))

const readings = computed(() => [
  { label: 'Sample every', longest: '1.5 MIN', value: drawings.value ? NAMES[slider.value.index.value] : '' },
  { label: 'Missed by', longest: '90.00°', value: missed.value }
])

const knob = new Spring()

let aim     = 0
let pointer = 0
let raf     = 0
let said    = -1
let seen    = 0
let speed   = 0
let then    = 0

/**
 * The lengths and the transform a frame writes, bound to the nodes the drawing
 * made when it last fit.
 */
let nodes: {
  gapHeight : SVGLength
  gapY      : SVGLength
  levelA    : SVGLength
  levelB    : SVGLength
  place     : SVGTransform
  radii     : SVGLength[]
  topX      : SVGLength
  topY      : SVGLength
  xs        : SVGLength[]
  ys        : SVGLength[]
} | undefined

const degrees = (elevation: number) => `${elevation.toFixed(2)}°`

const kick = () => {
  if (raf) return
  then = performance.now()
  raf  = requestAnimationFrame(tick)
}

const moved = () => {
  if (!nodes) return
  if (still()) return settle(slider.value.index.value)
  if (slider.value.gripped.value) {
    knob.rest(pointer)
    aim = pointer
    render()
  } else aim = slider.value.index.value
  kick()
}

/**
 * Returns the stop nearest a point `x` pixels from the drawing's left edge,
 * keeping where along the scale the pointer stands and how fast it moves.
 */
const pick = (x: number): number => {
  const stop = clamp((x - INSET) / (width.value - 2 * INSET) * LAST, 0, LAST)
  const now  = performance.now()
  if (slider.value.gripped.value)
    speed = 0.6 * (stop - pointer) / (Math.max(now - seen, 16) / 1000) + 0.4 * speed
  pointer = stop
  seen    = now
  return Math.round(stop)
}

const press = (event: PointerEvent) => {
  speed = 0
  seen  = performance.now()
  slider.value.press(event)
}

const release = () => {
  if (!slider.value.gripped.value) return
  slider.value.release()
  if (performance.now() - seen > 60) speed = 0
  speed = clamp(speed, -FLING, FLING)
  knob.velocity = speed
  slider.value.go(clamp(pointer + clamp(speed * CARRY, -0.45, 0.45), 0, LAST))
}

/**
 * Writes every node a frame changes, allocating nothing.
 */
const render = () => {
  const view = layout.value
  const data = scale.value
  if (!view || !data || !nodes) return
  const springs = dots.value
  let along = 0
  let when  = 0
  let top   = 0
  for (let index = 0; index < data.count; index++) {
    const rank      = index + data.low
    const stop      = clamp(springs[index].position, 0, LAST)
    const time      = timeAt(stop, rank)
    const elevation = data.pass.elevationAt(time)
    nodes.xs[index].value    = view.x(time)
    nodes.ys[index].value    = view.y(Math.max(elevation, -3))
    nodes.radii[index].value = elevation >= 0
      ? RADIUS
      : RADIUS * clamp(1 + elevation / 1.5, 0, 1) * clamp(Math.abs(stop - Math.round(stop)) * 6, 0, 1)
    if (rank !== 0) continue
    along = stop
    when  = time
    top   = elevation
  }
  const index  = Math.min(Math.floor(along), LAST - 1)
  const miss   = data.misses[index] + (along - index) * (data.misses[index + 1] - data.misses[index])
  const height = view.y(data.pass.pass.peak - miss)
  nodes.topX.value      = view.x(when)
  nodes.topY.value      = view.y(top)
  nodes.levelA.value    = height
  nodes.levelB.value    = height
  nodes.gapY.value      = view.y(data.pass.pass.peak)
  nodes.gapHeight.value = Math.max(0, height - nodes.gapY.value)
  nodes.place.setTranslate(view.along(clamp(knob.position, -0.25, LAST + 0.25)), view.below)
  const word = clamp(Math.round(miss * 100), 0, data.words.length - 1)
  if (word === said) return
  said         = word
  missed.value = data.words[word]
}

/**
 * Stops every part at `stop` and draws it there with the stop's own reading.
 */
const settle = (stop: number) => {
  knob.rest(stop)
  aim = stop
  for (const dot of dots.value) dot.rest(stop)
  render()
  said         = -1
  missed.value = scale.value?.exact[stop] ?? ''
}

const spoken = (index: number) => `A sample every ${NAMES[index].toLowerCase()}, `
  + `peak missed by ${scale.value!.misses[index].toFixed(2)} degrees`

const still = () => motion.value === 'reduce'

const tick = (now: number) => {
  const dt = clamp((now - then) / 1000, 0, 0.032)
  then = now
  raf  = 0
  if (still()) return settle(slider.value.index.value)
  const held = slider.value.gripped.value
  let moving = !held && knob.advance(aim, LAND, dt)
  for (const dot of dots.value) moving = dot.advance(knob.position, FOLLOW, dt) || moving
  render()
  if (moving || held) raf = requestAnimationFrame(tick)
  else settle(slider.value.index.value)
}

/**
 * Returns the time of the sample `rank` places from the highest one, partway
 * between where that rank falls at the stops on either side of `stop`.
 */
const timeAt = (stop: number, rank: number) => {
  const { tops } = scale.value!
  const index    = Math.min(Math.floor(stop), LAST - 1)
  const from     = tops[index] + rank * STOPS[index] * 1000
  return from + (stop - index) * (tops[index + 1] + rank * STOPS[index + 1] * 1000 - from)
}

watch(layout, view => {
  if (!view || !samples.value) return
  const marks = [...samples.value.children] as SVGCircleElement[]
  nodes = {
    gapHeight : gap.value!.height.baseVal,
    gapY      : gap.value!.y.baseVal,
    levelA    : level.value!.y1.baseVal,
    levelB    : level.value!.y2.baseVal,
    place     : handle.value!.transform.baseVal.getItem(0),
    radii     : marks.map(mark => mark.r.baseVal),
    topX      : summit.value!.cx.baseVal,
    topY      : summit.value!.cy.baseVal,
    xs        : marks.map(mark => mark.cx.baseVal),
    ys        : marks.map(mark => mark.cy.baseVal)
  }
  if (raf) render()
  else settle(slider.value.index.value)
}, { flush: 'post' })

const nudge = useIntersectionObserver(computed(() => layout.value && frame.value), ([entry]) => {
  if (!entry.isIntersecting) return
  nudge.stop()
  nudging.value = !still()
}, { threshold: 0.6 })

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  slider.value.leave()
})
</script>

<template>
  <figure ref="frame" class="panel">
    <div class="caps mb-3 text-base leading-snug text-soft">Drag the knob to change the spacing</div>
    <svg
      :class="['drawing group', slider.gripped.value ? 'cursor-grabbing held' : 'cursor-grab', { nudging }]"
      :width="layout?.full ?? 0"
      :height="layout?.tall ?? 0"
      :viewBox="`0 0 ${layout?.full ?? 0} ${layout?.tall ?? 0}`"
      aria-label="Time between samples"
      :aria-valuetext="scale ? spoken(slider.index.value) : undefined"
      v-bind="slider.attributes"
      v-on="{ ...slider.events, pointercancel: release, pointerdown: press, pointerup: release }"
      @animationend="nudging = false"
    >
      <g v-if="layout && scale">
        <rect
          :x="layout.box.left"
          :y="layout.box.top"
          :width="layout.box.width"
          :height="layout.box.height"
          class="fill-lift"
        />
        <clipPath :id="clip">
          <rect
            :x="layout.box.left"
            :y="layout.box.top"
            :width="layout.box.width"
            :height="layout.box.height"
          />
        </clipPath>
        <path :d="`M${layout.box.left} ${layout.y(0)}H${layout.box.right}`" class="axis" />
        <g :clip-path="`url(#${clip})`">
          <rect ref="gap" :x="layout.box.left" :width="layout.box.width" class="fill-u opacity-20" />
          <path
            :d="`M${layout.box.left} ${layout.peak.y}H${layout.box.right}`"
            class="fill-none stroke-u stroke-[1.5] [stroke-dasharray:6_4]"
          />
          <line
            ref="level"
            :x1="layout.box.left"
            :x2="layout.box.right"
            class="fill-none stroke-ink stroke-[1.25]"
          />
          <path
            :d="layout.curve"
            class="fill-none stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
            :stroke="drawings?.color"
          />
        </g>
        <g ref="samples">
          <circle v-for="index in scale.count" :key="index" :r="RADIUS" class="fill-ink" />
        </g>
        <circle ref="summit" r="7.5" class="fill-none stroke-ink stroke-[1.5]" />
        <circle :cx="layout.peak.x" :cy="layout.peak.y" r="5.5" class="fill-u" />
        <text
          :x="layout.peak.x"
          :y="layout.peak.y - 13"
          class="caps fill-soft text-base"
          text-anchor="middle"
        >PEAK</text>
        <path :d="`M${INSET} ${layout.below}H${layout.full - INSET}`" class="axis" />
        <g v-for="(step, index) in STOPS" :key="step">
          <circle :cx="layout.along(index)" :cy="layout.below" r="3" class="fill-ink" />
          <text
            v-if="step === TRACK_STEP || step === GRID_STEP"
            :x="layout.along(index)"
            :y="layout.below + 36"
            class="caps fill-soft text-base"
            text-anchor="middle"
          >{{ NAMES[index] }}</text>
        </g>
        <g ref="handle" transform="translate(0 0)">
          <g class="group-[.nudging]:animate-nudge">
            <circle r="19" class="fill-none stroke-u stroke-2 opacity-0 group-focus-visible:opacity-100" />
            <circle
              r="14"
              class="fill-panel stroke-ink stroke-2 transition-[stroke,stroke-width] duration-200
                group-hover:stroke-u group-hover:stroke-3 group-focus-visible:stroke-u
                group-focus-visible:stroke-3 group-[.held]:stroke-u group-[.held]:stroke-3
                motion-reduce:transition-none"
            />
            <path
              d="M-4 -5V5M0 -5V5M4 -5V5"
              class="fill-none stroke-ink stroke-[1.75] [stroke-linecap:round]"
            />
          </g>
        </g>
      </g>
    </svg>
    <Readings :readings="readings" />
  </figure>
</template>
