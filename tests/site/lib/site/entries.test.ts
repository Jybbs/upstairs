import { expect, it, vi } from 'vitest'

import { linkOf, sectionsOf } from '../../../../docs/.vitepress/lib/site/sections.ts'

vi.mock('vitepress', () => ({
  createContentLoader: (pattern: string[], options: object) => ({ options, pattern })
}))

it('lists the entries in the order the navigation bar shows the sections', async () => {
  const loaded: unknown     = await import('../../../../docs/.vitepress/lib/site/entries.data.ts')
  const { default: loader } = loaded as {
    default: { options: { transform: (pages: object[]) => unknown }, pattern: string[] }
  }
  const pages = sectionsOf().toReversed().map(section => ({
    frontmatter : { description: `About ${section}.` },
    url         : linkOf(section)
  }))
  expect(loader.options.transform(pages)).toEqual(sectionsOf().map(section => ({
    about   : `About ${section}.`,
    link    : linkOf(section),
    section : section
  })))
})
