import { useEventListener, useMediaQuery, useResizeObserver, useTimeoutFn } from '@vueuse/core'
import * as tabs                                                           from '@zag-js/tabs'
import { normalizeProps, useMachine }                                      from '@zag-js/vue'
import { computed, defineComponent, nextTick, onMounted, ref, useId, watch } from 'vue'

import { type Track, pitchOf } from '../lib/map/credit.ts'
import { GLYPHS }              from '../lib/site/seals.ts'
import { usePhone }            from '../lib/site/phone.ts'
import { sky }                 from '../lib/state/sky.ts'
import Seal                    from './Seal.tsx'
import Strokes                 from './Strokes.tsx'

/**
 * The milliseconds a pointer rests on a tab before its group opens.
 */
const INTENT = 200

/**
 * Sets a credit line with its last word kept whole where it is hyphenated, and
 * a notice opening on © whole.
 */
const lineOf = (text: string) => {
  if (text.startsWith('©')) return <span class="whitespace-nowrap">{text}</span>
  const [, head, last] = text.match(/^(.*?)(\S+-\S+)?$/)!
  return last ? [head, <span class="whitespace-nowrap">{last}</span>] : text
}

/**
 * Draws a source's track: its seal, its name, the credit line linking out,
 * and its license where it has one.
 */
const trackOf = (track: Track) => (
  <a
    class="credit-track"
    href={track.href}
    aria-label={`${track.label}: ${track.text}${track.source ? `, ${track.source.license}` : ''}`}
  >
    <Seal at={track.at} scale={0.9} source={track.source} strokes={track.glyph} />
    <span class="credit-name credit-caps">{track.name}</span>
    <span class="credit-said"><span class="credit-key">{lineOf(track.text)}</span></span>
    <span class="credit-license credit-caps">{track.source?.license}</span>
  </a>
)

/**
 * Draws the map's credit as a band over the time strip: the ring at the
 * strip's right end, or on a phone in the sheet's head, opening and closing
 * the band, and the band growing leftward from it, or on a phone rightward
 * from the sheet's edge, with the strip it leaves uncovered faded under a
 * veil. Every track takes the widest track's width, and the tabs at the
 * band's right end switch which group it shows, the band holding one width
 * through both. Emits `open` as a press of the ring opens it.
 */
export default defineComponent(
  (_props: object, { emit }) => {
    const id      = useId()
    const panel   = ref<HTMLElement>()
    const ring    = ref<HTMLButtonElement>()
    const still   = ref(true)
    const phone   = usePhone()
    const tablet  = useMediaQuery('(width < 75rem)')
    const groups  = sky.credit.groups
    const chosen  = ref(groups.value[0]!.heading)
    const open    = sky.credit.open
    const service = useMachine(tabs.machine, computed(() => ({
      id            : id,
      loopFocus     : false,
      onValueChange : ({ value }: tabs.ValueChangeDetails) => { chosen.value = value },
      orientation   : 'vertical' as const,
      translations  : { listLabel: 'Credit groups' },
      value         : chosen.value
    })))
    const turns   = computed(() => tabs.connect(service, normalizeProps))
    const intent  = useTimeoutFn((value: string) => { chosen.value = value }, INTENT, { immediate: false })

    /**
     * Measures the one width every track takes and the band's width at it,
     * holding every motion still while it measures.
     */
    const fit = async () => {
      const band = panel.value
      if (!band) return
      still.value      = true
      await nextTick()
      const mode       = phone.value ? 'phone' : tablet.value ? 'tablet' : 'wide'
      band.style.width = 'max-content'
      band.style.setProperty('--credit-pitch', `${pitchOf(band, mode)}px`)
      band.style.removeProperty('width')
      band.parentElement!.style.setProperty('--credit-w', `${band.offsetWidth}px`)
      requestAnimationFrame(() => requestAnimationFrame(() => { still.value = false }))
    }

    const press = () => {
      const opening = !open.value
      if (opening) emit('open')
      sky.credit.toggle(opening)
    }

    const rest = (event: PointerEvent, value: string) => {
      if (event.pointerType !== 'touch' && chosen.value !== value) intent.start(value)
    }

    const shut = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !open.value) return
      sky.credit.toggle(false)
      ring.value!.focus()
    }

    onMounted(() => {
      void fit()
      void document.fonts.ready.then(fit)
    })
    useResizeObserver(() => panel.value?.offsetParent as HTMLElement | undefined, () => void fit())
    useEventListener(panel, 'pointerdown', () => sky.credit.toggle(true))
    watch([phone, tablet, groups], () => void fit(), { flush: 'post' })

    return () => (
      <div
        class={['credit', { 'credit-still': still.value }]}
        data-credit={open.value ? 'open' : 'shut'}
        onKeydown={shut}
      >
        <div class="credit-veil" aria-hidden="true"><i class="credit-wash" /></div>
        <div class="credit-plate" aria-hidden="true" />
        <div
          ref={panel}
          id={`${id}-band`}
          class="credit-panel"
          role="group"
          aria-label="Map credits"
          inert={!open.value}
        >
          <div class="credit-groups">
            {groups.value.map(group => (
              <div
                {...turns.value.getContentProps({ value: group.heading })}
                class="credit-tracks"
                hidden={false}
                inert={chosen.value !== group.heading}
              >
                {group.tracks.map(trackOf)}
              </div>
            ))}
          </div>
          <div class="credit-tabs" {...turns.value.getListProps()}>
            {groups.value.map(group => (
              <button
                {...turns.value.getTriggerProps({ value: group.heading })}
                class="credit-tab"
                aria-label={`${group.heading}: ${group.tracks.map(track => track.name).join(', ')}`}
                onPointerenter={(event: PointerEvent) => rest(event, group.heading)}
                onPointerleave={intent.stop}
              >
                <svg class="credit-mark" viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
                  <Strokes strokes={group.mark} />
                </svg>
              </button>
            ))}
          </div>
        </div>
        <button
          ref={ring}
          type="button"
          class="credit-ring"
          aria-controls={`${id}-band`}
          aria-expanded={open.value}
          aria-label="Map credits"
          onClick={press}
        >
          <svg class="seal" viewBox="0 0 44 44" aria-hidden="true">
            <circle class="seal-edge" cx="22" cy="22" r="20.5" />
            <circle class="seal-hair" cx="22" cy="22" r="18" />
            <circle class="seal-core" cx="22" cy="22" r="15" />
            <g class="seal-glyph" transform="translate(22 22) scale(.5)">
              <clipPath id={`${id}-clip`}><circle r="26.2" /></clipPath>
              <Strokes clip={`${id}-clip`} strokes={GLYPHS.map} />
            </g>
          </svg>
        </button>
      </div>
    )
  },
  { emits: ['open'], name: 'Credit' }
)
