import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join }    from 'node:path'

import { Resvg }                                                    from '@resvg/resvg-js'
import { clampRgb, formatHex, oklab, wcagContrast, wcagLuminance } from 'culori'
import { createContentLoader }                                      from 'vitepress'

import manifest                           from '../../../package.json' with { type: 'json' }
import CLIMB                              from './climb.json' with { type: 'json' }
import { Face, type Faces, type Setting } from './faces.ts'
import MARK                               from './mark.json' with { type: 'json' }
import { boxOf, fadedWordOf }             from './mark.ts'
import { SCHEMES, type SchemeName }       from './palette.ts'
import * as sections                      from './sections.ts'

/**
 * A link-preview card drawn as SVG, the file it is written to, and its size
 * in pixels.
 */
export interface Card {
  file   : string
  height : number
  svg    : string
  width  : number
}

/**
 * The words each card sets beside its drawing, the home card's line and each
 * section's line taken from its page's description.
 */
export interface Lines {
  home     : string
  sections : Readonly<Record<sections.Section, string>>
}

/**
 * The site's address as the cards set it.
 */
const ADDRESS = new URL(manifest.homepage).host.toUpperCase()
/**
 * The size of a page's card, the size of the repository's social preview,
 * and the scheme both are drawn in.
 */
export const CARD = {
  height     : 630,
  repository : { file: 'cards/repository.png', height: 640, width: 1280 },
  scheme     : 'night',
  width      : 1200
} as const
/**
 * The home card, the hour climbing as a stair of passes between the word and
 * the line, each length a share of the card's width or a distance from an
 * edge in pixels, beside the ratio each thread's color holds on the page.
 */
const CLIMB_LAYOUT = {
  contrast : 3,
  glow     : 2.5,
  keyline  : 14,

  address  : { bottom: 44, right: 56, size: 42, tracking: 0.1 },
  line     : { bottom: 222, leading: 1.16, right: 56, share: 0.44, size: 50 },
  threads  : { bottom: 18, faint: 1.7, named: 4.4, opacity: { day: 0.7, night: 0.42 }, top: 26 },
  word     : { share: 0.2, x: 48, y: 34 }
}
/**
 * A section's card, the capital cut out of a star chart ruled in the section's
 * color, with the page's name, line, and address at fixed places on the card,
 * the line set at the largest size from `size` down to `least` that keeps it
 * to its baselines.
 */
export const NET_LAYOUT = {
  clearing : 26,
  cut      : 40,

  address  : { base: 578, right: 1148, size: 42, tracking: 0.1 },
  chart    : { hours: [10, 90, 10], pole: [-180, -420], reach: 2400, rings: [520, 1800, 110], stars: 380 },
  contrast : { day: 4.5, night: 6.5 },
  line     : { bases: [452, 510], least: 30, right: 1144, size: 50, width: 700 },
  mark     : { height: 342, x: 36, y: 263 },
  name     : { base: 209, size: 240, x: 53 },
  rules    : { opacity: 0.6, width: 1.8 },
  seed     : { first: 11, step: 29 },
  stars    : { opacity: 0.55 }
}

/**
 * Returns the path of a circle of radius `r` centered on `x`, `y`.
 */
const circleOf = (x: number, y: number, r: number) =>
  `M${x + r} ${y}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0`

/**
 * Draws the home card at `width` by `height` in `scheme`, every pass of the
 * recorded hour a thread from the second it rises to the second it sets,
 * stacked from the bottom in the order the passes peak.
 */
const climbOf = (
  faces  : Faces,
  height : number,
  line   : string,
  scheme : SchemeName,
  width  : number,
  layout = CLIMB_LAYOUT
) => {
  const { address, threads, word } = layout
  const [x0, y0, , boxHeight]      = boxOf(MARK.box)

  const colors  = SCHEMES[scheme]
  const night   = scheme === 'night'
  const tall    = Math.round(width * word.share)
  const scale   = tall / boxHeight
  const gap     = (height - threads.bottom - threads.top) / (CLIMB.passes.length - 1)
  const placed  = `translate(${word.x - x0 * scale} ${word.y - y0 * scale}) scale(${scale})`
  const strands = [false, true].flatMap(named => Object.entries(colors.kinds).map(([kind, color]) => {
    const d = CLIMB.passes
      .map((pass, i) => pass.named === named && pass.kind === kind
        ? `M${pass.rise / 3600 * width} ${height - threads.bottom - i * gap}H${pass.set / 3600 * width}` : '')
      .join('')
    const opacity = named ? '' : ` stroke-opacity="${threads.opacity[scheme]}"`
    const stroke  = heldOn(color, [colors.page], layout.contrast)
    const weight  = named ? threads.named : threads.faint
    return d ? `<path d="${d}" stroke="${stroke}" stroke-width="${weight}"${opacity}/>` : ''
  })).join('')
  const glow    = night
    ? `<filter id="glow" x="-50%" y="-50%" width="200%" height="200%">`
    + `<feGaussianBlur stdDeviation="${layout.glow}" result="blur"/>`
    + '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    : ''
  const set     = { leading: layout.line.leading, size: layout.line.size }
  const lines   = linesOf(faces.book, set, line, Math.round(width * layout.line.share), true)
  const first   = height - layout.line.bottom + faces.book.baselineOf(set.size, set.leading)
  const text    = lines.map((each, i) => faces.book.outlineTo(
    { size: set.size, text: each }, width - layout.line.right, first + i * set.size * set.leading)).join('')
  const at      = { size: address.size, text: ADDRESS, tracking: address.tracking }
  const atBase  = height - address.bottom - address.size + faces.mono.baselineOf(address.size, 1)
  const atLine  = faces.mono.outlineTo(at, width - address.right, atBase)
  return svgOf(width, height, colors.page, `<defs>${glow}</defs>`
    + `<g fill="none"${night ? ' filter="url(#glow)"' : ''}>${strands}</g>`
    + `<g transform="${placed}" fill="${colors.page}" stroke="${colors.page}" `
    + `stroke-width="${layout.keyline / scale}" stroke-linejoin="round"><path d="${MARK.capital}"/>`
    + `<path d="${MARK.lowercase}${MARK.tittle}"/></g>`
    + `<g transform="${placed}">${fadedWordOf(tall, colors.ink, colors.u)}</g>`
    + `<path d="${text}" fill="${colors.ink}"/><path d="${atLine}" fill="${colors.soft}"/>`)
}

/**
 * Darkens `color` on light grounds, or lightens it on dark ones, in steps of
 * OKLab lightness until it holds `ratio` to 1 on every ground.
 */
const heldOn = (color: string, grounds: readonly string[], ratio: number) => {
  const dark = grounds.reduce((sum, ground) => sum + wcagLuminance(ground), 0) / grounds.length < 0.18
  const lab  = oklab(color)!
  let held   = color
  const least = () => Math.min(...grounds.map(ground => wcagContrast(held, ground)))
  for (let step = 0; step < 90 && least() < ratio; step++) {
    lab.l += dark ? 0.01 : -0.01
    held   = formatHex(clampRgb(lab))
  }
  return held
}

/**
 * Lays `text` out in lines no wider than `width`, filling each line in turn,
 * or with `balanced` set, at the narrowest width that keeps the same count of
 * lines.
 */
const linesOf = (
  face     : Face,
  setting  : Omit<Setting, 'text'>,
  text     : string,
  width    : number,
  balanced = false
) => {
  const fill = (limit: number) => text.split(' ').reduce<string[]>((lines, word) => {
    const joined = `${lines.at(-1)} ${word}`
    if (lines.length && face.widthOf({ ...setting, text: joined }) <= limit) lines[lines.length - 1] = joined
    else lines.push(word)
    return lines
  }, [])
  const filled = fill(width)
  if (!balanced) return filled
  const count = filled.length
  let [low, high] = [0, width]
  while (high - low > 0.5) {
    const middle = (low + high) / 2
    if (fill(middle).length === count) high = middle
    else low = middle
  }
  return fill(high)
}

/**
 * Draws a section's card in `scheme`, a star chart ruled in the section's
 * color with the capital cut out of it and the mark drawn in the clearing,
 * throwing where the page's line wraps past the card's baselines at every size
 * the layout allows.
 */
const netOf = (
  faces   : Faces,
  line    : string,
  scheme  : SchemeName,
  section : sections.Section,
  layout  = NET_LAYOUT
) => {
  const { address, chart, mark, name } = layout
  const { bases, least, right, width } = layout.line
  const [x0, y0, box]                  = boxOf(MARK.master.box)
  const [px, py]                       = chart.pole

  const colors = SCHEMES[scheme]
  const color  = sectionColorOf(scheme, section, layout)
  const placed = `translate(${mark.x} ${mark.y}) scale(${mark.height / box}) translate(${-x0} ${-y0})`
  const rings  = []
  for (let r = chart.rings[0]; r < chart.rings[1]; r += chart.rings[2])
    rings.push(circleOf(px, py, r))
  for (let angle = chart.hours[0]; angle <= chart.hours[1]; angle += chart.hours[2]) {
    const turn = angle * Math.PI / 180
    rings.push(`M${px} ${py}L${px + chart.reach * Math.cos(turn)} ${py + chart.reach * Math.sin(turn)}`)
  }
  const random = seededFrom(layout.seed.first + sections.sectionsOf().indexOf(section) * layout.seed.step)
  const stars  = Array.from({ length: chart.stars }, () => {
    const r = random() ** 4 * 5.4 + 1, x = random() * CARD.width, y = random() * CARD.height
    return `${circleOf(x, y, r)}Z`
  }).join('')
  const nameD  = faces.display.outline({ size: name.size, text: section }, name.x, name.base)
  let size     = layout.line.size
  let lines    = linesOf(faces.book, { size }, line, width)
  while (lines.length > bases.length && size > least)
    lines = linesOf(faces.book, { size: --size }, line, width)
  if (lines.length > bases.length)
    throw new Error(
      `The line on the ${section} card runs to ${lines.length} lines at ${size} px, past its ${bases.length}`)
  const lineD  = lines.map((each, i) => faces.book.outlineTo({ size, text: each }, right, bases[i])).join('')
  const site    = { size: address.size, text: ADDRESS, tracking: address.tracking }
  const folder  = { size: address.size, text: `/${section.toUpperCase()}`, tracking: address.tracking }
  const siteD   = faces.mono.outlineTo(site, address.right - faces.mono.widthOf(folder), address.base)
  const folderD = faces.mono.outlineTo(folder, address.right, address.base)
  const words   = [nameD, lineD, siteD, folderD].join('')
  return svgOf(CARD.width, CARD.height, colors.page, '<defs>'
    + '<filter id="clearing" x="-10%" y="-30%" width="120%" height="160%" color-interpolation-filters="sRGB">'
    + '<feGaussianBlur stdDeviation="9"/><feComponentTransfer><feFuncA type="linear" slope="1.6"/>'
    + '</feComponentTransfer></filter>'
    + `<mask id="cut"><rect width="${CARD.width}" height="${CARD.height}" fill="#fff"/>`
    + `<path transform="${placed}" d="${MARK.capital}" fill="#000" stroke="#000" `
    + `stroke-width="${layout.cut}" stroke-linejoin="round"/></mask></defs>`
    + `<g mask="url(#cut)"><path d="${rings.join('')}" fill="none" stroke="${color}" `
    + `stroke-opacity="${layout.rules.opacity}" stroke-width="${layout.rules.width}"/>`
    + `<path d="${stars}" fill="${colors.soft}" fill-opacity="${layout.stars.opacity}"/></g>`
    + `<path filter="url(#clearing)" d="${words}" fill="${colors.page}" stroke="${colors.page}" `
    + `stroke-width="${layout.clearing}" stroke-linejoin="round"/>`
    + `<path d="${nameD}${lineD}" fill="${colors.ink}"/><path d="${siteD}" fill="${colors.soft}"/>`
    + `<path d="${folderD}" fill="${color}"/>`
    + `<path transform="${placed}" d="${MARK.master.d}" fill="${color}" fill-rule="evenodd"/>`)
}

/**
 * Returns the seeded run of numbers in 0 to 1 a section's stars are sown from,
 * so each card draws the same on every build.
 */
const seededFrom = (seed: number) => () => {
  seed  = seed + 0x6d2b79f5 | 0
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
  t     = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  return ((t ^ t >>> 14) >>> 0) / 4294967296
}

const svgOf = (width: number, height: number, page: string, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `
  + `viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${page}"/>${body}</svg>`

/**
 * Builds every card the site ships in the scheme `CARD` names, the home card
 * at the size of a page's card and of the repository's preview, and one card
 * for each section.
 */
export const cardsOf = (
  faces : Faces,
  lines : Lines,
  card  : Omit<typeof CARD, 'scheme'> & { scheme: SchemeName } = CARD
): Card[] => {
  const { repository, scheme } = card
  return [
    {
      file   : fileOf(),
      height : card.height,
      svg    : climbOf(faces, card.height, lines.home, scheme, card.width),
      width  : card.width
    },
    {
      file   : repository.file,
      height : repository.height,
      svg    : climbOf(faces, repository.height, lines.home, scheme, repository.width),
      width  : repository.width
    },
    ...sections.sectionsOf().map(section => ({
      file   : fileOf(section),
      height : card.height,
      svg    : netOf(faces, lines.sections[section], scheme, section),
      width  : card.width
    }))
  ]
}

/**
 * Returns the file a page's card is written to under the built site, the home
 * card for a page outside every section.
 */
export const fileOf = (section?: sections.Section) =>
  `cards/${section ? sections.folderOf(section) : 'home'}.png`

/**
 * Returns the color a section's card takes in `scheme`, its kind's Daylight
 * color held on the page at the ratio the layout sets for the scheme, so the
 * three sections stay apart at night as well.
 */
export const sectionColorOf = (scheme: SchemeName, section: sections.Section, layout = NET_LAYOUT) =>
  heldOn(SCHEMES.day.kinds[sections.SECTIONS[section]], [SCHEMES[scheme].page], layout.contrast[scheme])

/**
 * Renders every card as a PNG into the built site under `outDir`, reading
 * each line from the description of the page it stands for.
 */
export const writeCards = async (outDir: string) => {
  const folders = sections.sectionsOf().map(section => [section, sections.folderOf(section)])
  const loader  = createContentLoader(['index.md', ...folders.map(([, folder]) => `${folder}/index.md`)])
  const pages   = await loader.load()
  const said    = (path: string) => pages.find(({ url }) => url === path)!.frontmatter.description as string
  const lines   = {
    home     : said('/'),
    sections : Object.fromEntries(folders.map(([section, folder]) => [section, said(`/${folder}/`)]))
  } as Lines
  const faces   = await Face.faces()
  await mkdir(dirname(join(outDir, fileOf())), { recursive: true })
  await Promise.all(cardsOf(faces, lines).map(({ file, svg }) =>
    writeFile(join(outDir, file), new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng())))
}
