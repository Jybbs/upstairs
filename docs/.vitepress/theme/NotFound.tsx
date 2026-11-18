import {
  useMediaQuery,
  useMounted,
  usePreferredReducedMotion,
  useRafFn,
  useResizeObserver
} from '@vueuse/core'
import * as toggle                        from '@zag-js/toggle'
import { normalizeProps, useMachine }     from '@zag-js/vue'
import { defineClientComponent, useData } from 'vitepress'
import { type Ref, computed, defineComponent, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import { VacantSky, roomOf } from '../lib/map/vacant.ts'
import { SCHEMES, kindColor } from '../lib/site/palette.ts'
import { usePhone }           from '../lib/site/phone.ts'
import Readings               from './Readings.tsx'

const Credit = defineComponent(defineClientComponent(() => import('./Credit.tsx')).setup)

const SkyMap = defineComponent<{ backdrop: boolean, live: boolean }>(
  defineClientComponent(() => import('./SkyMap.tsx')).setup
)

/**
 * The space in pixels the numeral keeps from the edges of the map's open room.
 */
const CLEAR = 24
/**
 * The quarter hours the strip marks.
 */
const HOUR = ['Now', '+15', '+30', '+45', '+60']
/**
 * The strip's values with no pass over the address.
 */
const NONE = ['0', '—', '—']
/**
 * The strip's values once the ring's pass has reached the spot.
 */
const ONE = ['1', '71°', 'Now']
/**
 * The strip's readings, each with the longest value it takes.
 */
const READINGS = [
  { label: 'Passes', longest: '00' },
  { label: 'Highest', longest: '00°' },
  { label: 'Next', longest: '00:00' }
]

/**
 * Loads the shared state of the sky.
 */
const loadSky = () => import('../lib/state/sky.ts')

/**
 * Returns the strip's readings holding `values` in order.
 */
const readingsOf = (values: string[]) =>
  READINGS.map((reading, index) => ({ ...reading, value: values[index] }))

/**
 * Draws the hour at the address, its ground line under the quarter hours,
 * with no ridge until `crossed` raises the ring's pass at the start of the
 * hour.
 */
const Strip = defineComponent(
  (props: { crossed: boolean }) => () => (
    <section class="grid gap-2" aria-label="The hour at this address">
      <p class="caps text-soft">The hour at this address</p>
      <svg class="h-10 w-full" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0H400" class="guide" vector-effect="non-scaling-stroke" />
        <path d="M0 20H400" class="guide" vector-effect="non-scaling-stroke" />
        {props.crossed && (
          <path
            d="M0 39C14 39 22 4 40 4S66 39 80 39Z"
            fill={kindColor('science')}
            fill-opacity=".3"
            stroke={kindColor('science')}
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
        )}
        <path d="M0 39H400" class="stroke-ink" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      </svg>
      <ol class="caps flex list-none justify-between text-soft">
        {HOUR.map(tick => <li key={tick}>{tick}</li>)}
      </ol>
      <Readings readings={readingsOf(props.crossed ? ONE : NONE)} />
    </section>
  ),
  { name: 'NotFoundStrip', props: ['crossed'] }
)

/**
 * Sets the not-found page beside the map above a spot with no pass over it,
 * its ring a toggle calling one pass over the spot and its numeral a toggle
 * gathering the sky into 404, the catalog loading only once the numeral is
 * pressed. Wider than a phone, the map's credit sits in a box at the map's
 * foot, clear of whatever covers it, and the ring's room stops above that box.
 * On a phone, the strip under the credit's open band is hidden and inert.
 */
export default defineComponent(
  () => {
    const address  = ref('')
    const called   = ref(false)
    const canvas   = ref<HTMLCanvasElement>()
    const crossed  = ref(false)
    const foot     = ref<HTMLElement>()
    const gathered = ref(false)
    const lift     = ref(0)
    const pane     = ref<HTMLElement>()
    const panel    = ref<HTMLElement>()
    const ring     = shallowRef({ radius: 0, x: 0, y: 0 })
    const seat     = shallowRef({ height: 0, top: 0 })
    const strip    = ref<HTMLElement>()
    const words    = ref<HTMLElement>()
    const credit   = shallowRef({ open: ref(false) })

    const { isDark } = useData()
    const mounted    = useMounted()
    const phone      = usePhone()
    const md         = useMediaQuery('(width >= 48rem)')
    const lg         = useMediaQuery('(width >= 64rem)')
    const motion     = usePreferredReducedMotion()
    const reduced    = computed(() => motion.value === 'reduce')
    const scheme     = computed(() => SCHEMES[isDark.value ? 'night' : 'day'])
    const covered    = computed(() => phone.value && credit.value.open.value)

    let vacant: VacantSky | undefined

    /**
     * Moves the drawing `seconds` on and reads whether the ring's pass has
     * reached the spot.
     */
    const paint = (seconds: number) => {
      vacant?.draw(seconds)
      crossed.value = vacant?.crossed ?? false
    }

    const frames = useRafFn(({ delta }) => paint(delta / 1000), { immediate: false })

    /**
     * Returns the room of the map neither the panel, the strip, nor the credit's
     * box covers.
     */
    const roomOpen = () => roomOf(
      pane.value!.getBoundingClientRect(),
      panel.value!.getBoundingClientRect(),
      strip.value!.getBoundingClientRect(),
      ...foot.value ? [foot.value.getBoundingClientRect()] : []
    )

    /**
     * Returns the height in pixels that covers the map's foot below 1024 px,
     * the strip's from 768 px and the sheet's lip under it, and 0 from 1024 px.
     */
    const footCover = () => lg.value ? 0 : Math.max(0, Math.round(
      pane.value!.getBoundingClientRect().bottom
      - (md.value ? strip.value! : panel.value!).getBoundingClientRect().top
    ))

    /**
     * Sizes the drawing to the map, sets its ring in the open room, seats a
     * phone's credit over the strip, and lifts the credit's box clear of the
     * map's foot.
     */
    const layout = () => {
      if (!vacant) return
      const { clientHeight, clientWidth } = pane.value!
      const { offsetHeight, offsetTop }   = strip.value!
      lift.value                          = footCover()
      vacant.resize(clientWidth, clientHeight, devicePixelRatio, roomOpen())
      ring.value = { ...vacant.ring }
      seat.value = { height: offsetHeight, top: offsetTop }
      paint(0)
    }

    /**
     * Gathers the sky into the numeral over the open room of the map while the
     * numeral stands pressed.
     */
    const gather = async () => {
      const { sky }           = await loadSky()
      if (!gathered.value) return
      const { height, width } = roomOpen()
      sky.gather.value        = {
        height : height - 2 * CLEAR,
        left   : CLEAR,
        top    : CLEAR,
        width  : width - 2 * CLEAR
      }
    }

    /**
     * Lets the numeral go and returns the clock to the present.
     */
    const scatter = async () => {
      const { sky }    = await loadSky()
      sky.gather.value = null
      sky.back()
    }

    /**
     * Loads the catalog and gathers the sky into the numeral holding the
     * clock, or lets it go again and returns the clock to the present.
     */
    const press = async (pressed: boolean) => {
      gathered.value = pressed
      if (!pressed) return scatter()
      const { sky } = await loadSky()
      if (!gathered.value) return
      sky.loadOnce()
      sky.seek(sky.seconds)
      return gather()
    }

    /**
     * Calls the one pass across the map through the ring, or lets it go.
     */
    const call = (on: boolean) => {
      called.value = on
      vacant?.call(on)
      paint(0)
    }

    /**
     * Returns a toggle standing as `pressed` holds, passing each press to
     * `onPressedChange`.
     */
    const toggleOf = (pressed: Ref<boolean>, onPressedChange: (on: boolean) => unknown) => {
      const service = useMachine(toggle.machine, computed(() => ({
        onPressedChange : onPressedChange,
        pressed         : pressed.value
      })))
      return computed(() => toggle.connect(service, normalizeProps))
    }

    const numeral    = toggleOf(gathered, press)
    const ringToggle = toggleOf(called, call)

    /**
     * Hands the drawing the device's motion and the color scheme, holding its
     * frames still under reduced motion.
     */
    const restyle = () => {
      if (!vacant) return
      vacant.reduced = reduced.value
      vacant.scheme  = scheme.value
      if (reduced.value) frames.pause()
      else frames.resume()
      paint(0)
    }

    onMounted(() => {
      address.value = location.host + location.pathname
      void loadSky().then(({ sky }) => { credit.value = sky.credit })
      vacant        = new VacantSky(canvas.value!)
      restyle()
      layout()
    })

    /**
     * Lays the map out again, gathering the sky into the new room while it
     * stands gathered.
     */
    const refit = () => {
      layout()
      gather()
    }

    watch([reduced, scheme], restyle)
    watch([foot, lift], refit, { flush: 'post' })

    useResizeObserver([pane, strip, words, foot], refit)
    onBeforeUnmount(() => { if (gathered.value) scatter() })

    return () => (
      <main
        class="relative flex min-h-[calc(100dvh-var(--vp-nav-height))] flex-col overflow-hidden bg-page
               lg:grid lg:grid-cols-[440px_minmax(0,1fr)]"
      >
        <div
          ref={panel}
          class="relative z-10 -mt-4 flex flex-1 flex-col gap-6 rounded-t-xl border-t border-rule bg-panel
                 px-5 pt-3 pb-6 md:contents lg:col-start-1 lg:row-start-1 lg:mt-0 lg:flex lg:rounded-none
                 lg:border-t-0 lg:border-r lg:px-8 lg:py-10"
        >
          <span class="mx-auto h-1 w-9 rounded-full bg-dim md:hidden" aria-hidden="true" />
          {mounted.value && phone.value && (
            <Credit
              style={{
                '--credit-height' : `${seat.value.height}px`,
                '--credit-top'    : `${seat.value.top}px`
              }}
            />
          )}
          <div
            ref={words}
            class="grid justify-items-start gap-2.5 md:order-first md:grid-cols-[auto_minmax(0,1fr)]
                   md:items-center md:gap-x-10 md:border-b md:border-rule md:bg-panel md:px-6 md:py-6
                   lg:grid-cols-1 lg:items-stretch lg:gap-y-6 lg:border-0 lg:bg-transparent lg:p-0"
          >
            <p
              class="caps -order-2 text-soft md:col-start-2 md:row-start-1 md:self-end lg:col-auto
                     lg:row-auto"
            >
              Not found · {crossed.value ? 'One pass' : 'No pass'}
            </p>
            <p class="text-lg leading-snug text-ink md:col-start-2 md:row-start-2 lg:col-auto lg:row-auto">
              There is no page at{' '}
              <span class="font-mono text-base [overflow-wrap:anywhere]">{address.value}</span>.
            </p>
            <a
              class="text-lg text-ink underline decoration-soft underline-offset-4 hover:decoration-current
                     md:col-start-2 md:row-start-3 md:self-start lg:col-auto lg:row-auto"
              href="/"
            >
              Back to the map
            </a>
            <h1
              class="-order-1 font-display text-[128px] leading-none md:col-start-1 md:row-span-3
                     md:row-start-1 md:text-[152px] lg:col-auto lg:row-auto lg:text-[184px]"
            >
              <button
                {...numeral.value.getRootProps()}
                class="cursor-pointer text-ink hover:text-u aria-pressed:text-u"
                aria-label="Gather the sky into 404"
              >404</button>
            </h1>
          </div>
          <div
            ref={strip}
            inert={covered.value}
            class="credit-covered md:absolute md:inset-x-0 md:bottom-0 md:z-10 md:border-t md:border-rule
                   md:bg-panel/95 md:px-6 md:py-4 lg:static lg:mt-auto lg:border-0 lg:bg-transparent lg:p-0"
          >
            <Strip crossed={crossed.value} />
          </div>
        </div>
        <div
          ref={pane}
          class="relative h-[46vh] min-h-[300px] max-md:order-first md:h-auto md:min-h-[440px] md:flex-1
                 lg:col-start-2 lg:row-start-1"
        >
          {ring.value.radius > 0 && (
            <button
              {...ringToggle.value.getRootProps()}
              class="absolute z-10 cursor-pointer rounded-full outline-offset-2 focus-visible:outline-2
                     focus-visible:outline-u"
              style={{
                height : `${ring.value.radius * 2}px`,
                left   : `${ring.value.x - ring.value.radius}px`,
                top    : `${ring.value.y - ring.value.radius}px`,
                width  : `${ring.value.radius * 2}px`
              }}
              aria-label="Wait at the spot for a pass"
            />
          )}
          <SkyMap backdrop live={gathered.value} />
          <canvas ref={canvas} class="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />
          {mounted.value && !phone.value && (
            <div
              ref={foot}
              class="credit-unveiled absolute right-6 z-20 flex h-24 w-[min(calc(100%-48px),1040px)]
                     items-center justify-end"
              style={{ bottom: `${lift.value + 24}px` }}
            >
              <Credit />
            </div>
          )}
        </div>
      </main>
    )
  },
  { name: 'NotFound' }
)
