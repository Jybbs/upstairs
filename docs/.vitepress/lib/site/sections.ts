import type { DefaultTheme } from 'vitepress'

/**
 * The sections of the site in the order the navigation bar shows them, each
 * name serving as its folder, its label, and its overview's heading.
 */
const SECTIONS = ['Guide', 'Method', 'Data'] as const

/**
 * Builds the navigation bar's links, one per section, each marked active on
 * every page under its folder.
 */
export const navOf = () => SECTIONS.map(text => {
  const link = `/${text.toLowerCase()}/`
  return { activeMatch: `^${link}`, link, text } satisfies DefaultTheme.NavItemWithLink
})
