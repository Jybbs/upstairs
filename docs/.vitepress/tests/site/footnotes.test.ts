import { Window, type Document }  from 'happy-dom'
import { createMarkdownRenderer } from 'vitepress'
import { beforeAll, expect, it }  from 'vitest'

import { drawFootnotes, morseOf, nameOf } from '../../lib/site/footnotes.ts'

const PAGE = 'A model[^vallado2006], its revision[^vallado2006], and a check[^kelso2007].\n\n'
           + '[^vallado2006]: Vallado.\n\n[^kelso2007]: Kelso.'

let page: Document

beforeAll(async () => {
  const md = await createMarkdownRenderer('.', { config: drawFootnotes })
  page     = new new Window().DOMParser().parseFromString(await md.renderAsync(PAGE, {}), 'text/html')
})

const labels = (selector: string) => [...page.querySelectorAll(selector)].map(node => node.getAttribute('aria-label'))

it.each([['vallado2006', 'Vallado 2006'], ['kelso2007', 'Kelso 2007']])('names %s as %s', (key, name) =>
  expect(nameOf(key)).toBe(name))

it('labels each marker with its figure and its source, setting the figure on the disc', () => {
  expect(labels('.footnote-ref > a:first-child')).toEqual(
    ['Source 1, Vallado 2006', 'Source 1, Vallado 2006', 'Source 2, Kelso 2007'])
  expect([...page.querySelectorAll('.footnote-ref .fn-mark b')].map(node => node.textContent)).toEqual(['1', '1', '2'])
})

it('opens the list on the Sources title beside the emblem over the column of trails', () => {
  expect(page.querySelector('.footnotes > .fn-head > .fn-emblem + h2.fn-title')?.textContent).toBe('Sources')
  expect(page.querySelector('.footnotes > .fn-spine > svg path[fill]')).not.toBeNull()
  expect(page.querySelector('.footnotes-sep')).toBeNull()
})

it('opens each entry on its own marker', () =>
  expect([...page.querySelectorAll('.footnote-item > .fn-lead:first-child b')].map(node => node.textContent))
    .toEqual(['1', '2']))

it('letters the returns of a source cited twice and leaves a source cited once unlettered', () => {
  expect(labels('#footnote1 .fn-backs > .footnote-backref')).toEqual(
    ['Back to citation 1 of Vallado 2006', 'Back to citation 2 of Vallado 2006'])
  expect([...page.querySelectorAll('#footnote1 .fn-of')].map(node => node.textContent)).toEqual(['A', 'B'])
  expect(labels('#footnote2 .fn-backs > .footnote-backref')).toEqual(['Back to the citation of Kelso 2007'])
  expect(page.querySelector('#footnote2 .fn-of')).toBeNull()
})

it('points each return at the anchor beside the marker it came from', () => {
  const targets = [...page.querySelectorAll('.footnote-backref')].map(link => link.getAttribute('href')!.slice(1))
  expect(targets).toEqual([...page.querySelectorAll('.footnote-ref > .footnote-anchor')].map(anchor => anchor.id))
  expect(new Set(targets).size).toBe(targets.length)
})

it('spells SOURCES in Morse code down the column', () =>
  expect(morseOf('SOURCES')).toBe('. . .   - - -   . . -   . - .   - . - .   .   . . .       '))
