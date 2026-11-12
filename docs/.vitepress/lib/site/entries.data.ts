import { createContentLoader } from 'vitepress'

import * as sections from './sections.ts'

/**
 * A section's entry under the map, with its overview's address and the line
 * its overview describes itself with.
 */
interface Entry {
  about   : string
  link    : string
  section : sections.Section
}

declare const data: Entry[]
export { data }

/**
 * Loads each section's overview at build time into the entries the home page
 * lists under the map, in the order the navigation bar shows them.
 */
const overviews = sections.sectionsOf().map(section => `${sections.folderOf(section)}/index.md`)

export default createContentLoader(overviews, {
  transform: pages => sections.sectionsOf().map(section => {
    const link = sections.linkOf(section)
    return { about: pages.find(({ url }) => url === link)!.frontmatter.description as string, link, section }
  })
})
