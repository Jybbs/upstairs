import tailwindcss     from '@tailwindcss/vite'
import { defineConfig } from 'vitepress'

import manifest      from '../package.json' with { type: 'json' }
import { preloadOf } from './lib/site/preload.ts'
import { navOf }     from './lib/site/sections.ts'

const home = preloadOf('/theme/HomeMap.vue', 'index.md')

export default defineConfig({
  appearance    : false,
  cacheDir      : '../.cache/vite',
  description   : manifest.description,
  lang          : 'en-US',
  themeConfig   : { nav: navOf() },
  title         : 'Upstairs',
  transformHead : home.head,

  head: [
    ['link', { href: '/favicon.svg', rel: 'icon', type: 'image/svg+xml' }],
    ['meta', { content: '#f3f1ea', name: 'theme-color' }]
  ],

  vite: {
    build        : { license: { fileName: 'licenses.txt' } },
    optimizeDeps : { exclude: ['maplibre-gl'] },
    plugins      : [tailwindcss(), home.plugin],
    server       : { fs: { allow: ['../rust/pkg'] } },
    worker       : { format: 'es' }
  }
})
