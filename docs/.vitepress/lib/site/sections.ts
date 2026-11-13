import type { DefaultTheme } from 'vitepress'

import type { Kind } from '../orbit/kinds.ts'

export type Section = keyof typeof SECTIONS

/**
 * The sections of the site in the order the navigation bar shows them, each
 * name serving as its folder, its label, and its overview's heading, beside
 * the kind whose color its link-preview card takes.
 */
export const SECTIONS = {
  Guide  : 'navigation',
  Method : 'science',
  Data   : 'comms'
} as const satisfies Record<string, Kind>

/**
 * Returns the folder a section's pages sit in.
 */
export const folderOf = (section: Section) => section.toLowerCase()

/**
 * Returns the address of a section's overview.
 */
export const linkOf = (section: Section) => `/${folderOf(section)}/`

/**
 * Builds the navigation bar's links, one per section, each marked active on
 * every page under its folder.
 */
export const navOf = () => sectionsOf().map(text => {
  const link = linkOf(text)
  return { activeMatch: `^${link}`, link, text } satisfies DefaultTheme.NavItemWithLink
})

/**
 * Returns the section a page's source file sits under, or nothing for a page
 * outside every section's folder.
 */
export const sectionOf = (page: string) =>
  sectionsOf().find(section => page.startsWith(`${folderOf(section)}/`))

/**
 * Lists the sections in the order the navigation bar shows them.
 */
export const sectionsOf = () => Object.keys(SECTIONS) as Section[]
