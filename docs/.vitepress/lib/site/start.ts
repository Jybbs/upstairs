import manifest                     from '../../../package.json' with { type: 'json' }
import type { Faces }               from './faces.ts'
import { SCHEMES, type SchemeName } from './palette.ts'
import { linkOf }                   from './sections.ts'
import EMBLEMS                      from './start.json' with { type: 'json' }

/**
 * A page the README's start cards link, by the one word its card sets.
 */
export type StartPage = keyof typeof EMBLEMS

/**
 * A start card's panel, `width` by `height` pixels with corners of radius
 * `radius`, the page's address and its word each set from the left edge on a
 * baseline, and the page's emblem drawn in a 44 px square at `emblem`.
 */
export const START_LAYOUT = {
  emblem : { x: 196, y: 56 },
  height : 132,
  path   : { base: 34, size: 13, tracking: 0.1, x: 20 },
  radius : 8,
  width  : 260,
  word   : { base: 108, size: 40, tracking: -0.01, x: 20 }
}

/**
 * Returns the page's address as its card sets it, the host and path of its
 * link in capitals with no trailing slash.
 */
export const startAddressOf = (page: StartPage) => {
  const { host, pathname } = startLinkOf(page)
  return `${host}${pathname.replace(/\/$/, '')}`.toUpperCase()
}

/**
 * Draws a page's start card in `scheme`, the panel ruled at its edge, the
 * address in the mono face, the emblem in the U's color, and the word in the
 * title face, every word set as outlines.
 */
export const startCardOf = (faces: Faces, page: StartPage, scheme: SchemeName, layout = START_LAYOUT) => {
  const { emblem, height, path, radius, width, word } = layout
  const { ink, panel, rule, soft, u }                 = SCHEMES[scheme]

  const address = faces.mono.outline({ ...path, text: startAddressOf(page) }, path.x, path.base)
  const title   = faces.display.outline({ ...word, text: page }, word.x, word.base)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `
       + `viewBox="0 0 ${width} ${height}" role="img" aria-label="${page}">`
       + `<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="${radius}" `
       + `fill="${panel}" stroke="${rule}"/><path d="${address}" fill="${soft}"/>`
       + `<g transform="translate(${emblem.x} ${emblem.y})" color="${u}" fill="none" stroke="currentColor" `
       + `stroke-linecap="round" stroke-width="1.5">${EMBLEMS[page]}</g>`
       + `<path d="${title}" fill="${ink}"/></svg>\n`
}

/**
 * Returns the file under `docs/public/` a page's start card ships as in
 * `scheme`.
 */
export const startFileOf = (page: StartPage, scheme: SchemeName) =>
  `start/${page.toLowerCase()}-${scheme}.svg`

/**
 * Returns the page's link on the site, the home page for the map and the
 * section's overview for every other page.
 */
export const startLinkOf = (page: StartPage) =>
  new URL(page === 'Map' ? '/' : linkOf(page), manifest.homepage)

/**
 * Lists the pages the start cards link, in the order the README sets them.
 */
export const startPagesOf = () => Object.keys(EMBLEMS) as StartPage[]
