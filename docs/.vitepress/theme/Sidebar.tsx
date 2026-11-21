import { useTimeoutFn }                       from '@vueuse/core'
import { defineComponent, ref, type SlotsType } from 'vue'

import { sky }  from '../lib/state/sky.ts'
import Filters  from './Filters.tsx'
import Focus    from './Focus.tsx'
import PassList from './PassList.tsx'

/**
 * The sidebar's motion: the easing every move takes, the time in ms its
 * column widens or closes over, the time between one block's move and the
 * next, the time a block fades out over and the time between one block's fade
 * and the next as the sidebar folds, the time the rail's count fades out
 * over, how far a block slides, and the column's width.
 */
const MOTION = {
  ease   : 'cubic-bezier(0.22, 0.61, 0.36, 1)',
  fade   : 300,
  label  : 200,
  main   : 600,
  settle : 40,
  slide  : '1.5rem',
  step   : 120,
  width  : '26rem'
} as const

/**
 * Draws the map beside a sidebar holding the chosen pass's card, the pass
 * list, and the filters, and the rail between them that folds the sidebar
 * away and opens it again.
 *
 * Opening, the column widens as the map gives way and its blocks slide in one
 * after another; folding, the blocks fade first and the column closes after
 * them, then leaves the page so nothing folded away can be reached. A press
 * partway through turns the motion from where it stands, and under reduced
 * motion the sidebar opens and folds at once.
 */
export default defineComponent(
  (_, { slots }) => {
    const { ease, fade, label, main, settle, slide, step, width } = MOTION
    const open  = ref(true)
    const drawn = ref(true)
    const close = useTimeoutFn(
      () => { drawn.value = false },
      sky.reduced ? 0 : main + step,
      { immediate: false }
    )

    const toggle = () => {
      if (open.value) {
        open.value = false
        return close.start()
      }
      close.stop()
      drawn.value = true
      requestAnimationFrame(() => requestAnimationFrame(() => { open.value = true }))
    }

    const motion = (opening: string, closing: string) => sky.reduced ? 'none' : open.value ? opening : closing

    return () => {
      const total  = sky.rows.value.total
      const blocks = [<Focus />, <PassList boxed />, <Filters />]
      return (
        <div class="flex h-[calc(100dvh-var(--vp-nav-height))]">
          <div class="relative h-full min-w-0 flex-1 overflow-hidden">{slots.default()}</div>
          <button
            type="button"
            class="flex w-9 shrink-0 cursor-pointer flex-col items-center gap-3 border-l border-rule bg-panel
                   py-3 text-ink transition-colors hover:text-u focus-visible:outline-2
                   focus-visible:-outline-offset-2 focus-visible:outline-u"
            aria-expanded={open.value}
            aria-label={open.value ? 'Fold the list away' : `Show the list of ${total} passes`}
            onClick={toggle}
          >
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
              aria-hidden="true"
              style={{
                transform  : `rotate(${open.value ? 180 : 0}deg)`,
                transition : sky.reduced ? 'none' : `transform ${main}ms ${ease}`
              }}
            >
              <path d="M10 3L5 8L10 13" fill="none" stroke="currentColor" stroke-width="1.75" />
            </svg>
            <span
              class="caps whitespace-nowrap text-soft [writing-mode:vertical-rl]"
              style={{
                opacity    : open.value ? 0 : 1,
                transition : motion(`opacity ${label}ms ease`, `opacity ${main}ms ease ${2 * step}ms`)
              }}
              aria-hidden="true"
            >
              {total} passes
            </span>
          </button>
          <div
            class="h-full shrink-0 overflow-hidden"
            style={{
              width      : open.value ? width : '0px',
              transition : motion(`width ${main}ms ${ease}`, `width ${main}ms ${ease} ${step}ms`)
            }}
          >
            {drawn.value && (
              <aside
                class="flex h-full flex-col border-l border-rule bg-page"
                style={{ width: width }}
                aria-label="The chosen pass and the list"
              >
                {blocks.map((block, index) => (
                  <div
                    key={index}
                    class={['flex flex-col', index === 1 ? 'min-h-0 flex-1' : 'shrink-0']}
                    style={{
                      opacity    : open.value ? 1 : 0,
                      transform  : open.value ? 'none' : `translateX(${slide})`,
                      transition : motion(
                        `opacity ${main}ms ${ease} ${(index + 1) * step}ms, `
                        + `transform ${main}ms ${ease} ${(index + 1) * step}ms`,
                        `opacity ${fade}ms ease ${(blocks.length - 1 - index) * settle}ms, `
                        + `transform ${fade}ms ease ${(blocks.length - 1 - index) * settle}ms`
                      )
                    }}
                  >
                    {block}
                  </div>
                ))}
              </aside>
            )}
          </div>
        </div>
      )
    }
  },
  { name: 'Sidebar', slots: Object as SlotsType<{ default: () => unknown }> }
)
