import { defineComponent, ref, type SlotsType } from 'vue'

import { sky }  from '../lib/state/sky.ts'
import Filters  from './Filters.tsx'
import Focus    from './Focus.tsx'
import PassList from './PassList.tsx'

/**
 * The easing every move of the sidebar takes, the time in ms its column
 * widens or closes over, and the time between one block's move and the next.
 */
const EASE  = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
const MAIN  = 600
const STEP  = 120
const WIDTH = '26rem'

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
    const open  = ref(true)
    const drawn = ref(true)
    let timer: ReturnType<typeof setTimeout> | undefined

    const toggle = () => {
      clearTimeout(timer)
      if (open.value) {
        open.value = false
        timer      = setTimeout(() => { drawn.value = false }, sky.reduced ? 0 : MAIN + STEP)
        return
      }
      drawn.value = true
      requestAnimationFrame(() => requestAnimationFrame(() => { open.value = true }))
    }

    const motion = (opening: string, closing: string) => sky.reduced ? 'none' : open.value ? opening : closing

    return () => {
      const total  = sky.rows.value.list.length + sky.rows.value.more
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
                transition : motion(`transform ${MAIN}ms ${EASE}`, `transform ${MAIN}ms ${EASE}`)
              }}
            >
              <path d="M10 3L5 8L10 13" fill="none" stroke="currentColor" stroke-width="1.75" />
            </svg>
            <span
              class="caps whitespace-nowrap text-soft [writing-mode:vertical-rl]"
              style={{
                opacity    : open.value ? 0 : 1,
                transition : motion('opacity 200ms ease', `opacity ${MAIN}ms ease ${2 * STEP}ms`)
              }}
              aria-hidden="true"
            >
              {total} passes
            </span>
          </button>
          <div
            class="h-full shrink-0 overflow-hidden"
            style={{
              width      : open.value ? WIDTH : '0px',
              transition : motion(`width ${MAIN}ms ${EASE}`, `width ${MAIN}ms ${EASE} ${STEP}ms`)
            }}
          >
            {drawn.value && (
              <aside
                class="flex h-full flex-col border-l border-rule bg-page"
                style={{ width: WIDTH }}
                aria-label="The chosen pass and the list"
              >
                {blocks.map((block, index) => (
                  <div
                    key={index}
                    class={['flex flex-col', index === 1 ? 'min-h-0 flex-1' : 'shrink-0']}
                    style={{
                      opacity    : open.value ? 1 : 0,
                      transform  : open.value ? 'none' : 'translateX(1.5rem)',
                      transition : motion(
                        `opacity ${MAIN}ms ${EASE} ${(index + 1) * STEP}ms, `
                        + `transform ${MAIN}ms ${EASE} ${(index + 1) * STEP}ms`,
                        `opacity 300ms ease ${(blocks.length - 1 - index) * 40}ms, `
                        + `transform 300ms ease ${(blocks.length - 1 - index) * 40}ms`
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
