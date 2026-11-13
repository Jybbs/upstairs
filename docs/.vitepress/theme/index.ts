import '@fontsource/averia-serif-libre/700.css'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/jetbrains-mono'

import { defineClientComponent, type Theme } from 'vitepress'
import DefaultTheme                         from 'vitepress/theme-without-fonts'
import { h, onMounted }                     from 'vue'

import { followFootnotes } from '../lib/site/landing.ts'
import NotFound            from './NotFound.vue'
import Shield              from './Shield.vue'
import SiteMark            from './SiteMark.vue'
import './style.css'
import './credit.css'
import './footnotes.css'

export default {
  extends: DefaultTheme,

  Layout: () => h(DefaultTheme.Layout, null, {
    'doc-after'            : () => h(Shield, { class: 'mx-auto mt-12' }),
    'nav-bar-title-before' : () => h(SiteMark),
    'not-found'            : () => h(NotFound)
  }),

  enhanceApp: ({ app }) => {
    app.component('HomeMap', defineClientComponent(() => import('./HomeMap.vue')))
    app.component('LookAngles', defineClientComponent(() => import('./LookAngles.vue')))
    app.component('OrbitAges', defineClientComponent(() => import('./OrbitAges.vue')))
    app.component('PeakSearch', defineClientComponent(() => import('./PeakSearch.vue')))
  },

  setup: () => onMounted(() => followFootnotes(document))
} satisfies Theme
