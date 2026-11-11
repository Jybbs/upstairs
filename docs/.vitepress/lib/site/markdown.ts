import { readFileSync } from 'node:fs'

import { Cite }                  from '@citation-js/core'
import '@citation-js/plugin-bibtex'
import '@citation-js/plugin-csl'
import markdownItKatex           from '@vscode/markdown-it-katex'
import katex                     from 'katex'
import type { MarkdownRenderer } from 'vitepress'

import { drawFootnotes } from './footnotes.ts'
import { SHEETS }        from './sheets.ts'

const ADDRESS    = />(https:\/\/[^<]+)<\/a>/g
const FOOTNOTE   = /\[\^(\w+)\](?!:)/g
const REFERENCES = new URL('../../../references.bib', import.meta.url)

/**
 * Appends a definition for each footnote a page keys to an entry of
 * `citations` and defines nowhere itself, failing on a key neither names.
 */
const cite = (md: MarkdownRenderer, citations: Map<string, string>) =>
  md.core.ruler.after('normalize', 'upstairs:cite', state => {
    const keys = new Set([...state.src.matchAll(FOOTNOTE)].map(([, key]) => key))
    for (const key of keys) {
      if (state.src.includes(`[^${key}]:`)) continue
      const citation = citations.get(key)
      if (!citation) throw new Error(`The footnote ${key} names no entry in docs/references.bib`)
      state.src += `\n\n[^${key}]: ${citation}`
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
 * with its DOI linked, keyed by the entry's key, its address breaking only
 * after a slash.
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
 * KaTeX and to cite the entries of `docs/references.bib` through footnotes
 * keyed to them, drawn as `drawFootnotes` sets them.
 */
export const markdownOf = () => (md: MarkdownRenderer) => {
  md.use(markdownItKatex, { katex })
  cite(md, citationsOf())
  drawFootnotes(md)
  styleMath(md)
}
