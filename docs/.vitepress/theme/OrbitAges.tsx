import { useElementSize }                        from '@vueuse/core'
import { computed, defineComponent, ref, watch } from 'vue'

import { RING, SPREADS, ringGapOf, spreadOf } from '../lib/map/overlay.ts'
import { AGES }                               from '../lib/orbit/catalog.ts'
import { clamp }                              from '../lib/site/motion.ts'
import { useSlider }                          from '../lib/site/slider.ts'
import { useDrawings }                        from '../lib/state/drawings.ts'
import Readings                               from './Readings.tsx'

const BINS   = 48
const BOTTOM = 210
const HEIGHT = 250
const INSET  = 16
const LAST   = AGES.limit * 2
const OPEN   = 8
const RISE   = 54
const TOP    = 110
const REACH  = Math.log1p(LAST * OPEN)
const EDGES  = [0, ...SPREADS, AGES.limit]
const BANDS  = [...EDGES, LAST].slice(1).map((to, index) => {
  const [from, middle] = [EDGES[index], (EDGES[index] + to) / 2]
  const shade          = spreadOf(middle) === 2 ? 'fill-lift' : 'fill-lift opacity-45'
  return { from, middle, shade, to }
})
const BOUNDS = Array.from({ length: BINS + 1 }, (_, index) => Math.expm1(index / BINS * REACH) / OPEN)

/**
 * Draws how many element sets in the catalog stand at each age, on an axis
 * that opens up the first day, shaded by the ring each age takes on the map
 * with that ring drawn over its shade.
 */
export default defineComponent(
  () => {
    const { drawings, failure } = useDrawings()

    const frame = ref<HTMLElement>()
    const size  = useElementSize(frame)
    const width = computed(() => Math.round(size.width.value))

    const shares = computed(() => {
      const ages   = drawings.value?.ages ?? new Float64Array()
      const counts = Array.from({ length: BINS }, () => 0)
      for (const age of ages) if (age >= 0) counts[Math.min(BINS - 1, Math.floor(alongOf(age) * BINS))]++
      return counts.map(count => count / (ages.length || 1))
    })
    const columns = computed(() => {
      const tallest = Math.max(...shares.value)
      return shares.value.map((share, index) => {
        const height     = share / tallest * (BOTTOM - TOP - 8)
        const [from, to] = [x(BOUNDS[index]), x(BOUNDS[index + 1])]
        return { height, width: Math.max(1, to - from - 1), x: from + 0.5, y: BOTTOM - height }
      })
    })
    const rings = computed(() => {
      const radius = Math.min(34, ...BANDS.map(band => (x(band.to) - x(band.from)) / 2 - 8))
      return BANDS.map(band => ({
        cx     : (x(band.from) + x(band.to)) / 2,
        dash   : `0 ${ringGapOf(2 * Math.PI * radius, band.middle)}`,
        radius : radius
      }))
    })

    const readings = computed(() => {
      const index = shown.value
      return [
        { label: 'Orbit age', longest: '10.0 TO 15.0 D', value: spanOf(index) },
        {
          label   : 'Of the catalog',
          longest : '100%',
          value   : drawings.value ? percent(shares.value[index]) : ''
        }
      ]
    })

    /**
     * Measures how far along the axis `age` days stands, from 0 at no age to 1
     * at twice the limit.
     */
    const alongOf = (age: number) => Math.log1p(age * OPEN) / REACH

    const percent = (share: number) => `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`

    const pick = (px: number) => Math.floor(clamp((px - INSET) / (width.value - 2 * INSET), 0, 0.9999) * BINS)

    /**
     * Reads the ages of column `index`, the last column holding every age past
     * its lower bound.
     */
    const spanOf = (index: number) => {
      const [low, high] = [BOUNDS[index], BOUNDS[index + 1]]
      if (index === BINS - 1) return `${low.toFixed(1)} D OR MORE`
      if (high < 1 / 24) return `${Math.round(low * 1440)} TO ${Math.round(high * 1440)} MIN`
      if (high < 1) return `${Math.round(low * 24)} TO ${Math.round(high * 24)} H`
      return `${low.toFixed(1)} TO ${high.toFixed(1)} D`
    }

    const spoken = (index: number) => {
      const low  = BOUNDS[index].toFixed(2)
      const span = index === BINS - 1
        ? `${low} days or more`
        : `${low} to ${BOUNDS[index + 1].toFixed(2)} days`
      return `${span}, ${percent(shares.value[index])}`
    }

    const x = (age: number) => INSET + alongOf(age) * (width.value - 2 * INSET)

    /**
     * The column the slider stands on, opening on the one holding the largest
     * share of the catalog.
     */
    const shown  = ref(0)
    const slider = useSlider(BINS, shown, pick)
    watch(shares, values => { shown.value = values.indexOf(Math.max(...values)) }, { immediate: true })

    return () => (
      <figure ref={frame} class="panel">
        {failure.value
          ? <p class="caps m-0 text-base text-soft">{failure.value}</p>
          : [
            <svg
              class="drawing cursor-pointer"
              width={width.value}
              height={HEIGHT}
              viewBox={`0 0 ${width.value} ${HEIGHT}`}
              aria-label="Ages in the catalog"
              {...slider.props.value}
              aria-valuetext={drawings.value ? spoken(shown.value) : undefined}
            >
              {drawings.value && width.value > 0 && (
                <g>
                  {BANDS.map(band => (
                    <rect
                      key={band.from}
                      x={x(band.from)}
                      y={TOP}
                      width={x(band.to) - x(band.from)}
                      height={BOTTOM - TOP}
                      class={band.shade}
                    />
                  ))}
                  {rings.value.map(ring => (
                    <g key={ring.cx}>
                      <circle cx={ring.cx} cy={RISE} r={ring.radius + 10} class="fill-lift" />
                      <circle
                        cx={ring.cx}
                        cy={RISE}
                        r={ring.radius}
                        class="fill-none stroke-panel [stroke-linecap:round]"
                        stroke-width={RING.halo}
                        opacity={RING.alpha}
                        stroke-dasharray={ring.dash}
                      />
                      <circle
                        cx={ring.cx}
                        cy={RISE}
                        r={ring.radius}
                        class="fill-none [stroke-linecap:round]"
                        stroke={drawings.value?.color}
                        stroke-width={RING.width}
                        stroke-dasharray={ring.dash}
                      />
                      <circle
                        cx={ring.cx}
                        cy={RISE}
                        r="6.5"
                        class="stroke-panel stroke-[2.5]"
                        fill={drawings.value?.color}
                      />
                    </g>
                  ))}
                  {columns.value.map((column, index) => (
                    <rect key={index} {...column} class={index === shown.value ? 'fill-ink' : 'fill-dim'} />
                  ))}
                  <path d={`M${INSET} ${BOTTOM}H${width.value - INSET}`} class="axis" />
                  {EDGES.map(edge => (
                    <g key={edge}>
                      <path d={`M${x(edge)} ${BOTTOM}v6`} class="axis" />
                      <text
                        x={x(edge)}
                        y={BOTTOM + 24}
                        class="caps fill-soft text-base"
                        text-anchor={edge ? 'middle' : 'start'}
                      >{edge}</text>
                    </g>
                  ))}
                </g>
              )}
            </svg>,
            <Readings readings={readings.value} />
          ]}
      </figure>
    )
  },
  { name: 'OrbitAges' }
)
