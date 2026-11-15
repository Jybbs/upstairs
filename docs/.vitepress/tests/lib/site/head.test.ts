import type { TransformContext } from 'vitepress'
import { describe, expect, it }  from 'vitest'

import { CARD }   from '../../lib/site/cards.ts'
import { headOf } from '../../lib/site/head.ts'

const HOMEPAGE = 'https://upstairs.fyi'
const LINE     = 'Every active satellite above a spot you choose.'
const PAGES    = [
  { alt: 'Upstairs', card: 'home',  folder: '',       home: true,  type: 'website' },
  { alt: 'Guide',    card: 'guide', folder: 'guide/', home: false, type: 'article' },
  { alt: 'Data',     card: 'data',  folder: 'data/',  home: false, type: 'article' }
].map(page => ({ ...page, address: `${HOMEPAGE}/${page.folder}`, page: `${page.folder}index.md` }))
const contextOf = (page: string, frontmatter: object, isNotFound = false) => ({
  description : LINE,
  page        : page,
  pageData    : { frontmatter, isNotFound },
  siteData    : { lang: 'en-US', title: 'Upstairs' },
  title       : 'Guide | Upstairs'
}) as unknown as TransformContext
const tagsOf = (head: ReturnType<typeof headOf>) =>
  Object.fromEntries(head.map(([tag, attributes, content]) => [
    attributes.property ?? attributes.name ?? attributes.rel ?? attributes.type ?? tag,
    attributes.content ?? attributes.href ?? content
  ]))

describe.each(PAGES)('the head of $page', ({ address, alt, card, home, page, type }) => {
  const tags = tagsOf(headOf(contextOf(page, { isHome: home }), HOMEPAGE))

  it('points its canonical link and its og:url at its address', () => {
    expect(tags.canonical).toBe(address)
    expect(tags['og:url']).toBe(address)
  })
  it(`describes itself to a link preview as a ${type}`, () => {
    expect(tags['og:type']).toBe(type)
    expect(tags['og:title']).toBe('Guide | Upstairs')
    expect(tags['og:description']).toBe(LINE)
    expect(tags['og:site_name']).toBe('Upstairs')
    expect(tags['og:locale']).toBe('en_US')
  })
  it(`shows the ${card} card in a link preview`, () => {
    const image = `${HOMEPAGE}/cards/${card}.png`
    expect(tags['og:image']).toBe(image)
    expect(tags['twitter:image']).toBe(image)
    expect(tags['twitter:card']).toBe('summary_large_image')
    expect(tags['og:image:width']).toBe(String(CARD.width))
    expect(tags['og:image:height']).toBe(String(CARD.height))
    expect(tags['og:image:alt']).toBe(`${alt}, ${LINE}`)
  })
  it(`carries JSON-LD naming it a ${home ? 'WebSite' : 'WebPage'} at its address`, () =>
    expect(JSON.parse(tags['application/ld+json'])).toMatchObject({
      '@context' : 'https://schema.org',
      '@type'    : home ? 'WebSite' : 'WebPage',
      url        : address
    }))
})

describe('the head of the not-found page', () => {
  const tags = tagsOf(headOf(contextOf('404.md', {}, true), HOMEPAGE))

  it('leaves the canonical link, the address, and the JSON-LD off', () =>
    expect(Object.keys(tags))
      .toEqual(['og:title', 'og:description', 'og:type', 'og:locale', 'og:site_name', 'og:image',
                'og:image:width', 'og:image:height', 'og:image:type', 'og:image:alt', 'twitter:card',
                'twitter:image']))
  it('describes the home card it shows by the site’s name alone', () =>
    expect(tags['og:image:alt']).toBe('Upstairs'))
})
