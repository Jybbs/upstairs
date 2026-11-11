import { Glob }          from 'bun'
import { readFileSync }  from 'node:fs'
import { join }          from 'node:path'
import { fileURLToPath } from 'node:url'

import { createMarkdownRenderer, type MarkdownEnv } from 'vitepress'
import { beforeAll, describe, expect, it }          from 'vitest'

import { citationsOf, markdownOf } from '../../lib/site/markdown.ts'
import { SHEETS }                  from '../../lib/site/sheets.ts'

type Rendered = { env: MarkdownEnv, html: string }

const ROOT  = fileURLToPath(new URL('../../..', import.meta.url))
const PAGES = ['*.md', '*/*.md'].flatMap(pattern => Array.from(new Glob(pattern).scanSync(ROOT))).sort()

let render: (src: string) => Promise<Rendered>

beforeAll(async () => {
  const md = await createMarkdownRenderer('.', { config: markdownOf() })
  render   = async src => {
    const env: MarkdownEnv = { cleanUrls: false, path: 'page.md', relativePath: 'page.md' }
    return { env, html: await md.renderAsync(src, env) }
  }
})

describe('citationsOf', () => {
  it.each([...citationsOf()])('keys %s by surname and year and links its DOI or its publisher page', (key, citation) => {
    expect(key).toMatch(/^[a-z]+\d{4}$/)
    expect(citation).toMatch(/<a href="https:\/\/[^"]+">/)
  })

  it('breaks an address only after a slash', () =>
    expect(citationsOf().get('kelso2007')).toContain('<span class="fn-seg">https://</span><wbr>'
      + '<span class="fn-seg">celestrak.org/</span><wbr><span class="fn-seg">publications/</span>'))
})

describe('markdownOf', () => {
  it('sets the entry a footnote keys at the foot of the page', async () => {
    const { html } = await render('The SGP4 model[^vallado2006].')
    expect(html).toContain('<sup class="footnote-ref">')
    expect(html).toContain('<div data-csl-entry-id="vallado2006"')
    expect(html).toContain('<a href="https://doi.org/10.2514/6.2006-6753">')
  })

  it('sets one entry for a key a page cites twice', async () => {
    const { html } = await render('A model[^vallado2006] and its revision[^vallado2006].')
    expect(html.match(/footnote-item/g)).toHaveLength(1)
  })

  it('keeps the definition a page writes for its own footnote', async () => {
    const { html } = await render('A note[^vallado2006].\n\n[^vallado2006]: Written on the page.')
    expect(html).toContain('Written on the page.')
    expect(html).not.toContain('csl-entry')
  })

  it('fails on a footnote whose key names no entry and no definition', () =>
    expect(render('A guess[^nobody1999].'))
      .rejects.toThrow('The footnote nobody1999 names no entry in docs/references.bib'))

  it.each([
    ['inline between single dollars', 'An angle $\\theta$ rises.'],
    ['on its own line between double dollars', '$$\n\\theta = 90^\\circ\n$$']
  ])('sets a formula %s and links the stylesheet from the head', async (_, src) => {
    const { env, html } = await render(src)
    expect(html).toContain('<span class="katex">')
    expect(env.frontmatter?.head).toEqual([['link', { href: SHEETS.katex.href, rel: 'stylesheet' }]])
  })

  it('keeps the head a page sets and adds the stylesheet after it', async () => {
    const { env } = await render('---\nhead: [[meta, { name: robots }]]\n---\n\nAn angle $\\theta$.')
    expect(env.frontmatter?.head).toEqual([
      ['meta', { name: 'robots' }],
      ['link', { href: SHEETS.katex.href, rel: 'stylesheet' }]
    ])
  })

  it('links no stylesheet from a page setting no formula', async () =>
    expect((await render('Twelve dollars, $12, buy no formula.')).env.frontmatter?.head).toBeUndefined())

  it('marks a formula KaTeX cannot set', async () =>
    expect((await render('A broken $\\frac{1}$ formula.')).html).toContain('<span class="katex-error"'))

  it.each(PAGES)('sets every formula and footnote on %s', async page => {
    const { html } = await render(readFileSync(join(ROOT, page), 'utf8'))
    expect(html).not.toContain('katex-error')
    expect(html).not.toMatch(/\[\^\w+\]/)
  })
})
