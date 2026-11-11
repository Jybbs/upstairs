import { readFileSync } from 'node:fs'

import type { Plugin, SiteConfig, TransformContext } from 'vitepress'
import { expect, it, vi }                             from 'vitest'

import config         from '../config.ts'
import { writeCards } from '../lib/site/cards.ts'
import { cssOf }      from '../lib/site/palette.ts'

type Generate = (options: object, bundle: object) => void

vi.mock('../lib/site/cards.ts', async original =>
  ({ ...await original<typeof import('../lib/site/cards.ts')>(), writeCards: vi.fn() }))
vi.mock('../lib/site/licenses.ts', () =>
  ({ licensesOf: (...args: unknown[]) => ({ copied: args[3], name: 'upstairs:licenses' }) }))

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

it('appends the notice of each package whose sheet the site copies', () =>
  expect((config.vite!.plugins as Plugin[]).find(({ name }) => name === 'upstairs:licenses'))
    .toHaveProperty('copied', ['katex', 'maplibre-gl']))

it('writes the license notices to the file the Data page links', () => {
  const { fileName } = config.vite!.build!.license as { fileName: string }
  expect(readFileSync(new URL('../../data/index.md', import.meta.url), 'utf8')).toContain(`](/${fileName})`)
})

it('points the canonical link of a section page at its folder', () => {
  const context = {
    description : 'How to read the map, the pass list, and the time strip.',
    page        : 'guide/index.md',
    pageData    : { frontmatter: {} },
    siteData    : { base: '/', lang: 'en-US', title: 'Upstairs' },
    title       : 'Guide | Upstairs'
  } as unknown as TransformContext
  expect(config.transformHead!(context))
    .toContainEqual(['link', { href: 'https://upstairs.fyi/guide/', rel: 'canonical' }])
})

it('lets a reader switch between the two schemes', () => expect(config.appearance).toBeUndefined())

it('declares the tokens of both schemes in the head', () =>
  expect(config.head).toContainEqual(['style', {}, cssOf()]))

it('writes the cards into the built site', async () => {
  await config.buildEnd!({ outDir: '/site/dist' } as SiteConfig)
  expect(writeCards).toHaveBeenCalledWith('/site/dist')
})
