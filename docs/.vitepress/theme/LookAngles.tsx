import { useElementSize }                                  from '@vueuse/core'
import { computed, defineComponent, onBeforeUnmount, ref } from 'vue'

import { pointOf }              from '../lib/orbit/compass.ts'
import { LOOK_STEP, type Look } from '../lib/orbit/looks.ts'
import { clamp }                from '../lib/site/motion.ts'
import { endsOf, pathOf }       from '../lib/site/paths.ts'
import { usePlay }              from '../lib/site/play.ts'
import { Slider }               from '../lib/site/slider.ts'
import { CLOCK }                from '../lib/state/clock.ts'
import { titleOf, useDrawings } from '../lib/state/drawings.ts'
import Readings                 from './Readings.tsx'

const RADIANS = Math.PI / 180

/**
 * Draws the day's highest pass of the space station over the home spot in two
 * planes, the azimuth swept clockwise from north in the sky disc and the
 * elevation drawn as the angle above the horizon in the upright plane facing
 * the satellite, each reading set under the plane it is measured in. Once in
 * view, the pass plays from rise to set at the map's lapse.
 */
export default defineComponent(
  () => {
    const { drawings, failure } = useDrawings()

    const frame = ref<HTMLElement>()
    const size  = useElementSize(frame)
    const width = computed(() => Math.round(size.width.value))

    const looks = computed(() => drawings.value?.highest.looks ?? [])
    const peak  = computed(() => nearest(look => -look.elevation))
    const shape = computed(() => {
      const half   = Math.min(width.value / 2, 300)
      const cx     = half / 2
      const cy     = half / 2 + 8
      const radius = half / 2 - 26
      return { cx, cy, half, radius, reach: half - 32, sx: half + 16, sy: cy + radius }
    })
    const points = computed(() => looks.value.map(look => projected(look)))
    const trail  = computed(() => pathOf(points.value) + endsOf(points.value))
    const slider = computed(() => new Slider(looks.value.length, peak.value, pick))
    const look   = computed<Look | undefined>(() => looks.value[slider.value.index.value])

    const readings = computed(() => [
      { label: 'Azimuth', longest: '360° NNW', value: look.value ? azimuthOf(look.value) : '' },
      {
        label   : 'Elevation',
        longest : '90.0°',
        value   : look.value ? `${look.value.elevation.toFixed(1)}°` : ''
      }
    ])

    const parts = computed(() => {
      const { cx, cy, radius, reach, sx, sy } = shape.value
      const now = look.value
      if (!now) return null
      const lift   = Math.max(0, now.elevation) * RADIANS
      const wedge  = reach * 0.3
      const [x, y] = points.value[slider.value.index.value]
      const rim    = onDisc(now.azimuth, radius)
      const tip    = [sx + reach * Math.cos(lift), sy - reach * Math.sin(lift)] as const
      return {
        dot    : { cx: x, cy: y },
        needle : pathOf([[cx, cy], rim]),
        side   : { cx: tip[0], cy: tip[1] },
        sight  : pathOf([[sx, sy], tip]),
        sweep  : `M${cx} ${cy - radius}A${radius} ${radius} `
               + `0 ${now.azimuth > 180 ? 1 : 0} 1 ${rim[0]} ${rim[1]}`,
        wedge  : `M${sx} ${sy}H${sx + wedge}A${wedge} ${wedge} 0 0 0 `
               + `${sx + wedge * Math.cos(lift)} ${sy - wedge * Math.sin(lift)}Z`
      }
    })

    const azimuthOf = (look: Look) => `${Math.round(look.azimuth) % 360}° ${pointOf(look.azimuth)}`

    const nearest = (score: (look: Look, index: number) => number) => looks.value.reduce(
      (best, look, index) => score(look, index) < score(looks.value[best], best) ? index : best, 0)

    /**
     * Finds the point `r` pixels from the center of the sky disc at `azimuth`
     * degrees clockwise from north.
     */
    const onDisc = (azimuth: number, r: number): [number, number] => {
      const { cx, cy } = shape.value
      return [cx + r * Math.sin(azimuth * RADIANS), cy - r * Math.cos(azimuth * RADIANS)]
    }

    /**
     * Finds the look nearest a point on the sky disc, or the look on the side
     * of the peak the slider stands on whose elevation is nearest the angle a
     * point in the upright plane makes above its horizon.
     */
    const pick = (x: number, y: number): number => {
      const { cx, sx, sy } = shape.value
      if (x < 2 * cx)
        return nearest((_, index) => Math.hypot(points.value[index][0] - x, points.value[index][1] - y))
      const angle  = clamp(Math.atan2(sy - y, x - sx) / RADIANS, 0, 90)
      const rising = slider.value.index.value <= peak.value
      return nearest((look, index) =>
        (index <= peak.value) === rising ? Math.abs(look.elevation - angle) : Infinity)
    }

    const projected = (look: Look) =>
      onDisc(look.azimuth, shape.value.radius * (90 - Math.max(0, look.elevation)) / 90)

    const spoken = (look: Look) =>
      `Azimuth ${Math.round(look.azimuth) % 360} degrees, elevation ${look.elevation.toFixed(1)} degrees`

    usePlay(
      computed(() => looks.value.length ? frame.value : undefined),
      LOOK_STEP * 1000 / CLOCK.lapse,
      index => slider.value.go(index),
      () => looks.value.keys()
    )

    onBeforeUnmount(() => slider.value.grip.leave())

    return () => {
      const { cx, cy, half, radius, reach, sx, sy } = shape.value

      return (
        <figure ref={frame} class="panel">
          {failure.value
            ? <p class="caps m-0 text-base text-soft">{failure.value}</p>
            : [
              <div class="caps mb-3 text-base leading-snug text-soft">
                {drawings.value && titleOf(drawings.value, 'highest')}
              </div>,
              <svg
                class="drawing cursor-pointer"
                width={2 * half}
                height={half}
                viewBox={`0 0 ${2 * half} ${half}`}
                aria-label="The pass across the sky"
                aria-valuetext={look.value && spoken(look.value)}
                {...slider.value.attributes}
              >
                {parts.value && width.value > 0 && (
                  <g>
                    <circle cx={cx} cy={cy} r={radius} class="fill-lift" />
                    {[30, 60].map(elevation => (
                      <circle
                        key={elevation}
                        cx={cx}
                        cy={cy}
                        r={radius * (90 - elevation) / 90}
                        class="guide"
                      />
                    ))}
                    <path
                      d={`M${cx - radius} ${cy}H${cx + radius}M${cx} ${cy - radius}V${cy + radius}`}
                      class="guide"
                    />
                    <circle cx={cx} cy={cy} r={radius} class="axis" />
                    <text
                      x={cx}
                      y={cy - radius - 8}
                      class="caps fill-soft text-base"
                      text-anchor="middle"
                    >N</text>
                    <path d={parts.value.sweep} class="fill-none stroke-u stroke-3 [stroke-linecap:round]" />
                    <path
                      d={trail.value}
                      class="fill-none stroke-3 [stroke-linecap:round] [stroke-linejoin:round]"
                      stroke={drawings.value?.color}
                    />
                    <path d={parts.value.needle} class="fill-none stroke-ink stroke-[1.25]" />
                    <circle
                      {...parts.value.dot}
                      r="6.5"
                      class="stroke-panel stroke-[2.5]"
                      fill={drawings.value?.color}
                    />
                    <path d={`M${half + 4} ${sy}H${2 * half - 4}`} class="axis" />
                    <path
                      d={`M${sx + reach} ${sy}A${reach} ${reach} 0 0 0 ${sx} ${sy - reach}`}
                      class="guide"
                    />
                    <path d={parts.value.wedge} class="fill-u opacity-25" />
                    <path d={parts.value.sight} class="fill-none stroke-ink stroke-[1.25]" />
                    <circle cx={sx} cy={sy} r="4.5" class="fill-u" />
                    <circle
                      {...parts.value.side}
                      r="6.5"
                      class="stroke-panel stroke-[2.5]"
                      fill={drawings.value?.color}
                    />
                  </g>
                )}
              </svg>,
              <Readings readings={readings.value} />
            ]}
        </figure>
      )
    }
  },
  { name: 'LookAngles' }
)
