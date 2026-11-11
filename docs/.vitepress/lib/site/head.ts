import type { HeadConfig, TransformContext } from 'vitepress'

import { CARD, fileOf } from './cards.ts'
import { sectionOf }    from './sections.ts'

/**
 * Returns the address a built page is served at, its `index.html` dropped so a
 * section reads as its folder.
 */
const addressOf = (homepage: string, page: string) =>
  new URL(page.replace(/(^|\/)index\.html$/, '$1'), `${homepage}/`).href

/**
 * Builds the tags a link preview reads from a page's head, its card the one
 * of the section it sits under or the home card, with the canonical address
 * and the JSON-LD describing the page, both left off the not-found page since
 * it has no address of its own.
 */
export const headOf = (context: TransformContext, homepage: string): HeadConfig[] => {
  const { description, page, pageData, siteData, title } = context
  const address            = addressOf(homepage, page)
  const section            = sectionOf(page)
  const card               = addressOf(homepage, fileOf(section))
  const home               = pageData.frontmatter.isHome === true
  const tags: HeadConfig[] = [
    ['meta', { content: title, property: 'og:title' }],
    ['meta', { content: description, property: 'og:description' }],
    ['meta', { content: home ? 'website' : 'article', property: 'og:type' }],
    ['meta', { content: siteData.lang.replace('-', '_'), property: 'og:locale' }],
    ['meta', { content: siteData.title, property: 'og:site_name' }],
    ['meta', { content: card, property: 'og:image' }],
    ['meta', { content: String(CARD.width), property: 'og:image:width' }],
    ['meta', { content: String(CARD.height), property: 'og:image:height' }],
    ['meta', { content: 'image/png', property: 'og:image:type' }],
    ['meta', { content: `${section ?? siteData.title}, ${description}`, property: 'og:image:alt' }],
    ['meta', { content: 'summary_large_image', name: 'twitter:card' }],
    ['meta', { content: card, name: 'twitter:image' }]
  ]
  if (pageData.isNotFound) return tags
  const about = home
    ? { '@type': 'WebSite', description, name: siteData.title, url: address }
    : { '@type': 'WebPage', description, isPartOf: `${homepage}/`, name: title, url: address }
  return [
    ...tags,
    ['meta', { content: address, property: 'og:url' }],
    ['link', { href: address, rel: 'canonical' }],
    ['script', { type: 'application/ld+json' },
     JSON.stringify({ '@context': 'https://schema.org', ...about })]
  ]
}
