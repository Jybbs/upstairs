import '@fontsource/averia-serif-libre/700.css'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/jetbrains-mono'

import { defineClientComponent, type Theme } from 'vitepress'
import DefaultTheme                         from 'vitepress/theme-without-fonts'
import { h }                                from 'vue'

import NotFound from './NotFound.vue'
import SiteMark from './SiteMark.vue'
import './style.css'

export default {
  extends: DefaultTheme,

  Layout: () => h(DefaultTheme.Layout, null, {
    'nav-bar-title-before' : () => h(SiteMark),
    'not-found'            : () => h(NotFound)
  }),

  enhanceApp: ({ app }) => {
    app.component('HomeMap', defineClientComponent(() => import('./HomeMap.vue')))
  }
} satisfies Theme
