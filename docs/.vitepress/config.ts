import tailwindcss     from '@tailwindcss/vite'
import { defineConfig } from 'vitepress'

import manifest           from '../package.json' with { type: 'json' }
import { writeCards }     from './lib/site/cards.ts'
import { headOf }         from './lib/site/head.ts'
import { SCHEMES, cssOf } from './lib/site/palette.ts'
import { preloadOf }      from './lib/site/preload.ts'
import { navOf }          from './lib/site/sections.ts'

const home = preloadOf('/theme/HomeMap.vue', 'index.md')

export default defineConfig({
  buildEnd      : ({ outDir }) => writeCards(outDir),
  cacheDir      : '../.cache/vite',
  description   : manifest.description,
  lang          : 'en-US',
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
    optimizeDeps : { exclude: ['maplibre-gl'] },
    plugins      : [tailwindcss(), home.plugin],
    server       : { fs: { allow: ['../rust/pkg'] } },
    worker       : { format: 'es' }
  }
})
