import { readFileSync } from 'node:fs'

import { Cite }                  from '@citation-js/core'
import '@citation-js/plugin-bibtex'
import '@citation-js/plugin-csl'
import markdownItKatex           from '@vscode/markdown-it-katex'
import katex                     from 'katex'
import type { MarkdownRenderer } from 'vitepress'

import { HOLD }                  from '../map/credit.ts'
import { AGES }                  from '../orbit/catalog.ts'
import { STEEP }                 from '../orbit/looks.ts'
import { GRID_STEP, TRACK_STEP } from '../orbit/scan.ts'
import { DECIMALS, HOME }        from '../state/address.ts'
import { CLOCK }                 from '../state/clock.ts'
import { drawFootnotes }         from './footnotes.ts'
import { SHEETS }                from './sheets.ts'

const ADDRESS = />(https:\/\/[^<]+)<\/a>/g
const CODE    = /^[ \t]*((`|~)\2{2,})[^\n]*\n[\s\S]*?^[ \t]*\1\2*[^\S\n]*$|(`+)(?:.|\n(?![^\S\n]*$))*?\3/gm
/**
 * Each figure a page writes as `{{ name }}`, beside the value it takes.
 */
export const FIGURES = {
  ageLimit      : AGES.limit,
  ageWarn       : AGES.warn,
  decimals      : DECIMALS,
  gridMinutes   : GRID_STEP / 60,
  holdSeconds   : HOLD.wait / 1000,
  home          : HOME.place,
  lapse         : CLOCK.lapse,
  latchSeconds  : CLOCK.latch / 1000,
  spokenSeconds : CLOCK.spoken / 1000,
  steep         : STEEP,
  trackSeconds  : TRACK_STEP
} as const
const FIGURE     = /\{\{ *(?<name>.+?) *\}\}/g
const FOOTNOTE   = /\[\^(\w+)\](?!:)/g
const REFERENCES = new URL('../../../references.bib', import.meta.url)
const TAG        = /<!--[\s\S]*?-->|<(?<close>\/?)(?<tag>[a-z][\w-]*)(?<attrs>[^>]*)>/gi

/**
 * Appends a definition for each footnote a page keys to an entry of
 * `citations` and defines nowhere itself, failing on a key neither names,
 * and reads neither a key nor a definition inside code.
 */
const cite = (md: MarkdownRenderer, citations: Map<string, string>) =>
  md.core.ruler.after('normalize', 'upstairs:cite', state => {
    const prose = state.src.replace(CODE, '')
    const keys  = new Set([...prose.matchAll(FOOTNOTE)].map(([, key]) => key))
    for (const key of keys) {
      if (prose.includes(`[^${key}]:`)) continue
      const citation = citations.get(key)
      if (!citation) throw new Error(`The footnote ${key} names no entry in docs/references.bib`)
      state.src += `\n\n[^${key}]: ${citation}`
    }
  })

/**
 * The element marked `v-pre` still open after `html`, and how many elements of
 * its tag are open inside it, given the one open before.
 */
const preAfter = (html: string, pre?: { depth: number, tag: string }) => {
  for (const { groups: { attrs = '', close, tag } = {} } of html.matchAll(TAG)) {
    if (!tag || attrs.endsWith('/')) continue
    if (pre?.tag === tag.toLowerCase()) pre.depth += close ? -1 : 1
    else if (!pre && !close && /\sv-pre\b/.test(attrs)) pre = { depth: 1, tag: tag.toLowerCase() }
    if (pre?.depth === 0) pre = undefined
  }
  return pre
}

/**
 * Writes the value `FIGURES` holds for each `{{ name }}` in a text token
 * outside a `v-pre` container or element, failing on a name it holds no value
 * for.
 */
const figure = (md: MarkdownRenderer) =>
  md.core.ruler.after('text_join', 'upstairs:figure', state => {
    let container = 0
    let element: Parameters<typeof preAfter>[1]
    for (const token of state.tokens.flatMap(token => [token, ...token.children ?? []])) {
      if (token.type.startsWith('html_')) element = preAfter(token.content, element)
      container += Number(token.type === 'container_v-pre_open') - Number(token.type === 'container_v-pre_close')
      if (token.type !== 'text' || container || element) continue
      token.content = token.content.replace(FIGURE, (_, name: string) => {
        if (!Object.hasOwn(FIGURES, name)) throw new Error(`The figure ${name} names no entry in FIGURES`)
        return String(FIGURES[name as keyof typeof FIGURES])
      })
    }
  })

/**
 * Links KaTeX's stylesheet from the head of a page that sets a formula, so
 * every other page loads none of it.
 */
const styleMath = (md: MarkdownRenderer) =>
  md.core.ruler.push('upstairs:math', state => {
    const tokens = state.tokens.flatMap(token => [token, ...token.children ?? []])
    if (!tokens.some(token => token.type.startsWith('math_'))) return
    (state.env.frontmatter.head ??= []).push(['link', { href: SHEETS.katex.href, rel: 'stylesheet' }])
  })

/**
 * Sets each entry of `docs/references.bib` as one line of HTML in APA style
 * with its DOI or its publisher's page linked, keyed by the entry's key, its
 * address breaking only after a slash.
 */
export const citationsOf = () => new Map(
  (new Cite(readFileSync(REFERENCES, 'utf8')).format('bibliography', {
    asEntryArray : true,
    format       : 'html',
    hyperlinks   : true,
    template     : 'apa'
  }) as [string, string][]).map(([key, html]) => [key, html.trim().replace(ADDRESS, (_, address: string) =>
    `>${address.split(/(?<=\/)(?!\/)/).map(segment => `<span class="fn-seg">${segment}</span>`).join('<wbr>')}</a>`)])
)

/**
 * Extends the Markdown renderer to set math between `$` and `$$` through
 * KaTeX, to write each figure `FIGURES` holds, and to cite the entries of
 * `docs/references.bib` through footnotes keyed to them, drawn as
 * `drawFootnotes` sets them.
 */
export const markdownOf = () => (md: MarkdownRenderer) => {
  md.use(markdownItKatex, { katex })
  cite(md, citationsOf())
  figure(md)
  drawFootnotes(md)
  styleMath(md)
}
