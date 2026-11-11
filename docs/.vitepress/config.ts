import tailwindcss        from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { defineConfig }   from 'vitepress'

import manifest           from '../package.json' with { type: 'json' }
import { writeCards }     from './lib/site/cards.ts'
import { headOf }         from './lib/site/head.ts'
import { licensesOf }     from './lib/site/licenses.ts'
import { markdownOf }     from './lib/site/markdown.ts'
import { SCHEMES, cssOf } from './lib/site/palette.ts'
import { preloadOf }      from './lib/site/preload.ts'
import { SHEETS }         from './lib/site/sheets.ts'
import { navOf }          from './lib/site/sections.ts'

const LICENSES = 'licenses.txt'
const home     = preloadOf('/theme/HomeMap.vue', 'index.md')
const notices  = licensesOf(
  LICENSES,
  new URL('../../rust/Cargo.toml', import.meta.url),
  new URL('../../rust/pkg/licenses.txt', import.meta.url)
)

export default defineConfig({
  buildEnd      : ({ outDir }) => writeCards(outDir),
  cacheDir      : '../.cache/vite',
  description   : manifest.description,
  lang          : 'en-US',
  markdown      : { config: markdownOf() },
  themeConfig   : { nav: navOf(), siteTitle: false },
  title         : 'Upstairs',
  transformHead : context => [...home.head(context), ...headOf(context, manifest.homepage)],

  head: [
    ['link', { href: '/favicon.svg', rel: 'icon', type: 'image/svg+xml' }],
    ['meta', { content: SCHEMES.day.page, media: '(prefers-color-scheme: light)', name: 'theme-color' }],
    ['meta', { content: SCHEMES.night.page, media: '(prefers-color-scheme: dark)', name: 'theme-color' }],
    ['style', {}, cssOf()]
  ],

  vite: {
    build        : { license: { fileName: LICENSES } },
    optimizeDeps : { exclude: ['maplibre-gl'] },
    server       : { fs: { allow: ['../rust/pkg'] } },
    worker       : { format: 'es' },
    plugins      : [
      tailwindcss(),
      home.plugin,
      notices,
      viteStaticCopy({ targets: Object.values(SHEETS).map(sheet => sheet.copy) })
    ]
  }
})
