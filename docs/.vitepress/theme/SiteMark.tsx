import { defineComponent } from 'vue'

import MARK from '../lib/site/mark.json' with { type: 'json' }

/**
 * Draws the site's mark in the nav bar.
 */
export default defineComponent(
  () => () => (
    <svg
      class="flex-none fill-u"
      viewBox={MARK.s32.box}
      width="32"
      height="32"
      role="img"
      aria-label="Upstairs"
    >
      <path d={MARK.capital} fill-opacity=".3" />
      <path d={MARK.s32.d} fill-rule="evenodd" />
    </svg>
  ),
  { name: 'SiteMark' }
)
