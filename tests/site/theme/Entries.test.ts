// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { data as entries } from '../../../docs/.vitepress/lib/site/entries.data.ts'
import { kindColor }       from '../../../docs/.vitepress/lib/site/palette.ts'
import { SECTIONS }        from '../../../docs/.vitepress/lib/site/sections.ts'
import Entries             from '../../../docs/.vitepress/theme/Entries.tsx'

vi.mock('../../../docs/.vitepress/lib/site/entries.data.ts', async () => {
  const sections = await import('../../../docs/.vitepress/lib/site/sections.ts')
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
