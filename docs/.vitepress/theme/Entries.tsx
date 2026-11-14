import { defineComponent } from 'vue'

import { data as entries } from '../lib/site/entries.data.ts'
import { kindColor }       from '../lib/site/palette.ts'
import { SECTIONS }        from '../lib/site/sections.ts'

/**
 * Links each section of the site beside a line on what it holds.
 */
export default defineComponent(
  () => () => (
    <nav class="grid gap-px border-t border-rule bg-rule sm:grid-cols-3" aria-label="Sections">
      {entries.map(({ about, link, section }) => (
        <a
          key={section}
          href={link}
          class="group flex flex-col gap-2 bg-panel p-6 no-underline hover:bg-lift"
        >
          <span class="flex items-center gap-2 font-display text-2xl text-ink">
            <span class="h-px w-6" style={{ background: kindColor(SECTIONS[section]) }} />{section}
          </span>
          <span class="font-book text-lg leading-snug text-soft group-hover:text-ink">{about}</span>
        </a>
      ))}
    </nav>
  ),
  { name: 'Entries' }
)
