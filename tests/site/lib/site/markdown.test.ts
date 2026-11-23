import { Glob }          from 'bun'
import { readFileSync }  from 'node:fs'
import { join }          from 'node:path'
import { fileURLToPath } from 'node:url'

import { createMarkdownRenderer, type MarkdownEnv } from 'vitepress'
import { beforeAll, describe, expect, it }          from 'vitest'

import { FIGURES, citationsOf, markdownOf } from '../../../../docs/.vitepress/lib/site/markdown.ts'
import { SHEETS }                           from '../../../../docs/.vitepress/lib/site/sheets.ts'

type Rendered = { env: MarkdownEnv, html: string }

const ROOT  = fileURLToPath(new URL('../../../../docs', import.meta.url))
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
  it.each([...citationsOf()])('keys %s by surname and year '
                            + 'and links its DOI or its publisher page', (key, citation) => {
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
      .rejects.toThrow('The footnote nobody1999 names no entry in docs/.vitepress/lib/site/references.bib'))

  it('fails on an inline footnote beside a keyed footnote', () =>
    expect(render('A claim^[a note] and a check[^kelso2007].'))
      .rejects.toThrow(
        'The inline footnote ^[a note] names no entry in docs/.vitepress/lib/site/references.bib'
      ))

  it.each([
    ['a code span', 'Write `[^surname2024]` after the claim.', []],
    ['a code span between double backticks', 'Write ``[^surname2024]`` after the claim.', []],
    ['a fenced block', '```md\nA claim[^surname2024].\n```\n\nA check[^kelso2007].', ['kelso2007']],
    ['a block fenced by tildes', '~~~md\nA claim[^surname2024].\n~~~\n\nA check[^kelso2007].', ['kelso2007']],
    ['a fenced block in a list item',
      '- item\n\n  ```md\n  A[^surname2024].\n\n  A[^surname2024].\n  ```\n\nA check[^kelso2007].',
      ['kelso2007']]
  ])('reads no footnote key inside %s', async (_, src, keys) =>
    expect([...(await render(src)).html.matchAll(/data-csl-entry-id="(\w+)"/g)].map(([, key]) => key))
      .toEqual(keys))

  it('sets the entry for a key whose only definition sits inside code', async () =>
    expect((await render('A check[^kelso2007].\n\n```md\n[^kelso2007]: Kelso.\n```')).html)
      .toContain('<div data-csl-entry-id="kelso2007"'))

  it.each(Object.entries(FIGURES))('writes the figure %s as the value %s', async (name, value) =>
    expect((await render(`A figure of {{ ${name} }} and {{${name}}}.`)).html)
      .toContain(`<p>A figure of ${value} and ${value}.</p>`))

  it.each(['nobody', 'toString', 'AGES.limit', '$frontmatter.title'])('fails on the figure %s', name =>
    expect(render(`A guess of {{ ${name} }}.`))
      .rejects.toThrow(`The figure ${name} names no entry in FIGURES`))

  it.each([
    ['a code span', 'Write `{{ home }}` at {{ steep }}.'],
    ['a fenced block', '```md\n{{ home }}\n```\n\nRead at {{ steep }}.'],
    ['a block fenced by tildes', '~~~md\n{{ home }}\n~~~\n\nRead at {{ steep }}.'],
    ['a fenced block in a list item',
      '- item\n\n  ```md\n  {{ home }}\n\n  {{ home }}\n  ```\n\nRead at {{ steep }}.'],
    ['an HTML comment', '<!-- {{ home }} -->\n\nRead at {{ steep }}.'],
    ['a v-pre container', '::: v-pre\n{{ home }}\n:::\n\nRead at {{ steep }}.'],
    ['inline math', 'Write $\\text{{{ home }}}$ at {{ steep }}.'],
    ['display math', '$$\n\\text{{{ home }}}\n$$\n\nRead at {{ steep }}.']
  ])('writes no figure inside %s', async (_, src) => {
    const { html } = await render(src)
    expect(html).toContain(`at ${FIGURES.steep}.`)
    expect(html).toContain('{{ home }}')
    expect(html).not.toContain(FIGURES.home)
  })

  it('writes a figure whose first brace is escaped', async () =>
    expect((await render('A figure of \\{{ steep }}.')).html)
      .toContain(`<p>A figure of ${FIGURES.steep}.</p>`))

  it.each([
    ['a block element', '<div v-pre>\n\nA sign.\n\n</div>\n\n{{ steep }} degrees is steep.'],
    ['an inline element', 'Write <span v-pre>{{ home }}</span> at {{ steep }}.']
  ])('fails on a figure beside %s marked v-pre', (_, src) =>
    expect(render(src)).rejects.toThrow('A page writing a figure marks verbatim text with ::: v-pre'))

  it.each([
    ['writing no figure', '<div v-pre>{{ home }}</div>'],
    ['writing braces only in a v-pre container', '::: v-pre\n{{ home }}\n:::\n\n<div v-pre>{{ home }}</div>']
  ])('keeps the braces inside an element marked v-pre on a page %s', async (_, src) =>
    expect((await render(src)).html).toContain('<div v-pre>{{ home }}</div>'))

  it('writes a figure beside the attributes data-v-pre and v-prefix', async () =>
    expect((await render('<div data-v-pre v-prefix>\n\nRead at {{ steep }}.\n\n</div>')).html)
      .toContain(`at ${FIGURES.steep}.`))

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

  it.each([
    ['inline between single dollars', 'A square $x^{{2}}$ at {{ steep }}.'],
    ['on its own line between double dollars', '$$\nx^{{2}}\n$$\n\nRead at {{ steep }}.'],
    ['inline closing after a space', 'A square $x^{{2}} $ at {{ steep }}.'],
    ['inline across a line break', 'A square $x^{{2}}\ny$ at {{ steep }}.'],
    ['inline holding an escaped dollar', 'A square $x^{{2}} \\$ 1$ at {{ steep }}.']
  ])('sets a formula %s holding double braces as TeX', async (_, src) => {
    const { html } = await render(src)
    expect(html).toContain('<annotation encoding="application/x-tex">x^{{2}}')
    expect(html).toContain(`at ${FIGURES.steep}.`)
    expect(html).not.toContain('katex-error')
  })

  it.each([
    ['an escaped dollar', 'Costs \\$5 at {{ steep }}$ each.'],
    ['a dollar after a letter', 'A a$x at {{ steep }}$ b.'],
    ['a dollar before a letter', 'A $x at {{ steep }}$s b.'],
    ['three dollars', 'A $$$x at {{ steep }}$ b.']
  ])('writes a figure beside %s that opens no formula', async (_, src) =>
    expect((await render(src)).html).toContain(`at ${FIGURES.steep}$`))

  it('marks a formula KaTeX cannot set', async () =>
    expect((await render('A broken $\\frac{1}$ formula.')).html).toContain('<span class="katex-error"'))

  it.each(PAGES)('sets every formula, footnote, and figure on %s', async page => {
    const { html } = await render(readFileSync(join(ROOT, page), 'utf8'))
    expect(html).not.toContain('katex-error')
    expect(html.replace(/<code>[\s\S]*?<\/code>/g, '')).not.toMatch(/\[\^\w+\]|\{\{/)
  })
})
