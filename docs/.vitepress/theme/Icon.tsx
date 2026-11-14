import { computed, defineComponent } from 'vue'

import { KINDS, type Kind }            from '../lib/orbit/kinds.ts'
import { GRID, iconOf, type IconName } from '../lib/site/icons.ts'
import { kindColor }                   from '../lib/site/palette.ts'

/**
 * Draws one mark from the icon sheet, a kind of satellite's in its own color
 * and every other in the color of the text around it.
 */
export default defineComponent(
  (props: { name: IconName | null, size?: number }) => {
    const tint = computed(() => props.name && props.name in KINDS ? kindColor(props.name as Kind) : undefined)

    return () => {
      const size = props.size ?? 16
      return props.name && (
        <svg
          class="shrink-0"
          aria-hidden="true"
          viewBox={`0 0 ${GRID} ${GRID}`}
          width={size}
          height={size}
          style={{ color: tint.value }}
          data-icon={props.name}
        >
          <path d={iconOf(props.name, size)} fill="currentColor" />
        </svg>
      )
    }
  },
  { name: 'Icon', props: ['name', 'size'] }
)
