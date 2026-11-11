import type { Plugin, TransformContext } from 'vitepress'
import { expect, it }                     from 'vitest'

import config from '../config.ts'

type Generate = (options: object, bundle: object) => void

const BUNDLE = {
  home: {
    facadeModuleId : '/site/.vitepress/theme/HomeMap.vue',
    fileName       : 'assets/chunks/HomeMap.abc.js',
    type           : 'chunk'
  }
}

it('preloads the map chunk from the head of the home page', () => {
  const plugin = (config.vite!.plugins as Plugin[]).find(({ name }) => name === 'upstairs:preload')!
  ;(plugin.generateBundle as Generate).call({}, {}, BUNDLE)
  const context = {
    page     : 'index.md',
    pageData : { frontmatter: { isHome: true } },
    siteData : { base: '/', lang: 'en-US', title: 'Upstairs' }
  } as unknown as TransformContext
  expect(config.transformHead!(context))
    .toContainEqual(['link', { href: '/assets/chunks/HomeMap.abc.js', rel: 'modulepreload' }])
})
