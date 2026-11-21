import { usePreferredReducedMotion }                               from '@vueuse/core'
import { TransitionGroup, defineComponent, nextTick, ref, useId } from 'vue'

import * as guide from '../lib/site/guide.ts'
import Locator    from './Locator.tsx'
import './guide.css'

/**
 * The timing of the growth from a control into its whole screen, and of the
 * chosen section's words rising in once it has started.
 */
const GROWTH = {
  rise : { delay: 200, duration: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
  zoom : { duration: 650, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }
} as const

/**
 * Opens the Guide on a figure of each control it describes, one section's
 * figure and opening words large beside a rail of the other sections, each a
 * miniature beside its heading. Choosing a row grows its figure out of the
 * raised control into the whole screen, and every section's words stand in
 * one cell, so the block keeps one size whichever section it shows. Each slot
 * named for a control holds its section's opening words.
 */
export default defineComponent(
  (_, { slots }) => {
    const id     = useId()
    const motion = usePreferredReducedMotion()
    const chosen = ref<guide.Part>(guide.PARTS[0])
    const frame  = ref<HTMLElement>()
    const stage  = ref<HTMLElement>()
    const words  = new Map<guide.Part, HTMLElement>()

    const choose = async (part: guide.Part) => {
      chosen.value = part
      stage.value?.focus({ preventScroll: true })
      if (motion.value === 'reduce') return
      await nextTick()
      frame.value?.animate(
        [{ transform: guide.zoomOf(guide.viewOf(part)), transformOrigin: '0 0' }, { transform: 'none' }],
        GROWTH.zoom
      )
      words.get(part)?.animate(
        [{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }],
        GROWTH.rise
      )
    }

    const numberOf = (part: guide.Part) => guide.PARTS.indexOf(part) + 1
    const heading  = (part: guide.Part) => [
      <span class="guide-number caps" aria-hidden="true">{numberOf(part)}</span>,
      guide.CONTROLS[part].title
    ]

    return () => (
      <div class="guide-figures">
        <div class="guide-block">
          <section
            ref={stage}
            id={`${id}-stage`}
            class="guide-stage"
            tabindex="-1"
            aria-label={guide.CONTROLS[chosen.value].title}
          >
            <figure class="guide-figure">
              <div class="guide-frame">
                <div ref={frame} class="guide-zoom"><Locator part={chosen.value} /></div>
              </div>
              <figcaption class="caps guide-caption">
                Fig. {numberOf(chosen.value)} · {guide.CONTROLS[chosen.value].caption}
              </figcaption>
            </figure>
            <div class="guide-words">
              {guide.PARTS.map(part => (
                <div
                  ref={node => node ? words.set(part, node as HTMLElement) : words.delete(part)}
                  class="guide-opening"
                  inert={chosen.value !== part}
                >
                  <a class="guide-title" href={guide.anchorOf(part)}>{heading(part)}</a>
                  {slots[part]?.()}
                </div>
              ))}
            </div>
          </section>
          <ul class="guide-rail">
            <TransitionGroup name="guide-slide">
              {guide.PARTS.filter(part => part !== chosen.value).map((part, at) => (
                <li key={part} style={{ '--at': at }}>
                  <button
                    type="button"
                    class="guide-row"
                    aria-controls={`${id}-stage`}
                    onClick={() => choose(part)}
                  >
                    <span class="guide-thumb" aria-hidden="true"><Locator part={part} /></span>
                    <span class="guide-label">{heading(part)}</span>
                  </button>
                </li>
              ))}
            </TransitionGroup>
          </ul>
        </div>
      </div>
    )
  },
  { name: 'GuideFigures' }
)
