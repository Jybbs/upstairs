// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { data as entries } from '../../lib/site/entries.data.ts'
import { kindColor }       from '../../lib/site/palette.ts'
import { SECTIONS }        from '../../lib/site/sections.ts'
import Entries             from '../../theme/Entries.vue'

vi.mock('../../lib/site/entries.data.ts', async () => {
  const sections = await import('../../lib/site/sections.ts')
  return {
    data: sections.sectionsOf().map(section => ({
      about   : `What the ${section} pages hold.`,
      link    : sections.linkOf(section),
      section : section
    }))
  }
})

it('links each overview beside the line it describes itself with and a rule in its kind’s color', () => {
  const links = mount(Entries).findAll('a').map(link => {
    const [heading, about] = link.findAll(':scope > span')
    return {
      about   : about.text(),
      link    : link.attributes('href'),
      rule    : heading.get('span').attributes('style'),
      section : heading.text()
    }
  })
  expect(links).toEqual(entries.map(({ about, link, section }) =>
    ({ about, link, rule: `background: ${kindColor(SECTIONS[section])};`, section })))
})
