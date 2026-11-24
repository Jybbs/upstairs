import { readFileSync } from 'node:fs'

import maplibre                   from 'maplibre-gl/package.json' with { type: 'json' }
import { searchForWorkspaceRoot } from 'vite'
import type { PageData, Plugin, SiteConfig, TransformContext, TransformPageContext } from 'vitepress'
import { expect, it, vi }         from 'vitest'

import config         from '../../docs/.vitepress/config.ts'
import { writeCards } from '../../docs/.vitepress/lib/site/cards.ts'
import { cssOf }      from '../../docs/.vitepress/lib/site/palette.ts'
import { SHEETS }     from '../../docs/.vitepress/lib/site/sheets.ts'
import { ROOT }       from './common/reads.ts'

type Generate = (options: object, bundle: object) => void

vi.mock('../../docs/.vitepress/lib/site/cards.ts', async original =>
  ({ ...await original<typeof import('../../docs/.vitepress/lib/site/cards.ts')>(), writeCards: vi.fn() }))
vi.mock('../../docs/.vitepress/lib/site/licenses.ts', () =>
  ({ licensesOf: (...args: unknown[]) => ({ copied: args[3], name: 'upstairs:licenses' }) }))

const BUNDLE = {
  'assets/chunks/HomeMap.abc.js': {
    facadeModuleId : '/site/.vitepress/theme/HomeMap.tsx',
    fileName       : 'assets/chunks/HomeMap.abc.js',
    imports        : [],
    type           : 'chunk'
  }
}

it('preloads the map chunk and the map sheet of the installed release '
 + 'from the head of the home page', () => {
  const plugin = (config.vite!.plugins as Plugin[]).find(({ name }) => name === 'upstairs:preload')!
  ;(plugin.generateBundle as Generate).call({}, {}, BUNDLE)
  const context = {
    page     : 'index.md',
    pageData : { frontmatter: { isHome: true } },
    siteData : { base: '/', lang: 'en-US', title: 'Upstairs' }
  } as unknown as TransformContext
  expect(config.transformHead!(context)).toEqual(expect.arrayContaining([
    ['link', { href: '/assets/chunks/HomeMap.abc.js', rel: 'modulepreload' }],
    ['link', { as: 'style', href: `/maplibre-gl/maplibre-gl.css?v=${maplibre.version}`, rel: 'preload' }]
  ]))
})

it('appends the notice of each package whose sheet the site copies', () =>
  expect((config.vite!.plugins as Plugin[]).find(({ name }) => name === 'upstairs:licenses'))
    .toHaveProperty('copied', ['katex', 'maplibre-gl']))

it('writes the license notices to the file the Data page links', () => {
  const { fileName } = config.vite!.build!.license as { fileName: string }
  expect(readFileSync(new URL('../../docs/data/index.md', import.meta.url), 'utf8'))
    .toContain(`](/${fileName})`)
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

it.each([
  ['links a section page to its neighbors', {}, { link: '/guide/', text: 'Guide' }],
  ['keeps the links a page sets for itself', { prev: false }, false]
])('%s', (_, frontmatter, prev) =>
  expect(config.transformPageData!(
    { frontmatter, relativePath: 'method/index.md' } as PageData,
    {} as TransformPageContext
  ))
    .toEqual({ frontmatter: { next: { link: '/data/', text: 'Data' }, prev } }))

it('lets a reader switch between the two schemes', () => expect(config.appearance).toBeUndefined())

it('declares the tokens of both schemes in the head', () =>
  expect(config.head).toContainEqual(['style', {}, cssOf()]))

it('writes the cards into the built site', async () => {
  await config.buildEnd!({ outDir: '/site/dist' } as SiteConfig)
  expect(writeCards).toHaveBeenCalledWith('/site/dist')
})

it.each([
  ['/*', 'Permissions-Policy: geolocation=(self)'],
  [`/${config.assetsDir ?? 'assets'}/*`, 'Cache-Control: public, max-age=31536000, immutable'],
  [`/${SHEETS.map.name}/*`, 'Cache-Control: public, max-age=31536000, immutable']
])('serves the files under %s with their headers', (rule, headers) =>
  expect(readFileSync(new URL('../../docs/public/_headers', import.meta.url), 'utf8'))
    .toContain(`${rule}\n  ${headers}\n`))

it('gives the dev server the whole repository, which holds the build of the crate', () =>
  expect(searchForWorkspaceRoot(process.cwd())).toBe(ROOT))

it('links the touch icon from the head', () =>
  expect(config.head).toContainEqual(['link', { href: '/apple-touch-icon.png', rel: 'apple-touch-icon' }]))
