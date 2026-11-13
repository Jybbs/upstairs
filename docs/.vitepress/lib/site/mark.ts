import MARK                         from './mark.json' with { type: 'json' }
import { SCHEMES, type SchemeName } from './palette.ts'

/**
 * The cap heights in pixels below which the U in the word sits over the
 * capital's outline, and below which it takes the 16 px drawing.
 */
const CAPS = { outlined: 48, small: 20 }
/**
 * The capital's height as a share of the 1000 units the word's box stands.
 */
const CAP_SHARE = 689 / 1000
/**
 * The height the README sets the word at, in pixels.
 */
const README_HEIGHT = 72
/**
 * The touch icon's file under the built site, its side, and the side of the
 * drawing centered on it, all in pixels.
 */
export const TOUCH = { file: 'apple-touch-icon.png', mark: 112, size: 180 } as const

/**
 * Returns the word's U in `u` at the drawing its cap height takes, over the
 * capital's outline below the outlined cap height.
 */
const capitalOf = (height: number, u: string) => {
  const cap     = height * CAP_SHARE
  const outline = cap < CAPS.outlined ? `<path d="${MARK.capital}" fill="${u}" fill-opacity=".3"/>` : ''
  return outline + `<path d="${cap < CAPS.small ? MARK.s16.d : MARK.word}" fill="${u}" fill-rule="evenodd"/>`
}

/**
 * Reads a drawing's box as its left, top, width, and height in its own units.
 */
export const boxOf = (box: string) => box.split(' ').map(Number)

/**
 * Returns the word's drawing in its own units, the U in `u` at the drawing
 * its cap height takes and the lowercase in `ink`.
 */
export const drawnWordOf = (height: number, ink: string, u: string) =>
  capitalOf(height, u) + `<path d="${MARK.lowercase}${MARK.tittle}" fill="${ink}"/>`

/**
 * Returns the word the cards draw, the U as `drawnWordOf` draws it, the
 * lowercase filled with a fade from `u` to `ink` across the p to the a, and
 * the i's tittle in `u`.
 */
export const fadedWordOf = (height: number, ink: string, u: string) =>
    capitalOf(height, u)
  + `<defs><linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="${MARK.fade.from}" `
  + `x2="${MARK.fade.to}" y1="0" y2="0"><stop offset="0" stop-color="${u}"/>`
  + `<stop offset="1" stop-color="${ink}"/></linearGradient></defs>`
  + `<path d="${MARK.lowercase}" fill="url(#fade)"/><path d="${MARK.tittle}" fill="${u}"/>`

/**
 * Builds the favicon, the 16 px drawing over the capital's outline at 30% in
 * the U's color of the scheme the device prefers.
 */
export const faviconOf = () =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK.s16.box}"><style>path{fill:${SCHEMES.day.u}}`
  + `@media (prefers-color-scheme:dark){path{fill:${SCHEMES.night.u}}}</style>`
  + `<path d="${MARK.capital}" fill-opacity=".3"/><path d="${MARK.s16.d}" fill-rule="evenodd"/></svg>\n`

/**
 * Builds the touch icon, the favicon's drawing knocked out in the Daylight
 * page's color on a ground of the Daylight U's teal, centered at `TOUCH.mark`
 * pixels on a tile `TOUCH.size` pixels square.
 */
export const touchIconOf = () => {
  const { mark, size } = TOUCH
  const { page, u }    = SCHEMES.day
  const inset          = (size - mark) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" `
       + `viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${u}"/>`
       + `<svg x="${inset}" y="${inset}" width="${mark}" height="${mark}" viewBox="${MARK.s16.box}">`
       + `<path d="${MARK.capital}" fill="${page}" fill-opacity=".3"/>`
       + `<path d="${MARK.s16.d}" fill="${page}" fill-rule="evenodd"/></svg></svg>`
}

/**
 * Builds the word the README opens on in one scheme's ink and U, at the
 * height the README sets it.
 */
export const wordmarkOf = (scheme: SchemeName) => {
  const [, , width, height] = boxOf(MARK.box)
  const { ink, u }          = SCHEMES[scheme]
  const scale               = README_HEIGHT / height
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK.box}" `
       + `width="${(width * scale).toFixed(1)}" height="${README_HEIGHT}" role="img" aria-label="Upstairs">`
       + `${drawnWordOf(README_HEIGHT, ink, u)}</svg>\n`
}
