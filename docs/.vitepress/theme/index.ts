import '@fontsource/averia-serif-libre/700.css'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/jetbrains-mono'

import { defineClientComponent, type Theme } from 'vitepress'
import DefaultTheme                         from 'vitepress/theme-without-fonts'
import { h, onMounted }                     from 'vue'

import { followFootnotes } from '../lib/site/landing.ts'
import Credits             from './Credits.tsx'
import GuideFigures        from './GuideFigures.tsx'
import NotFound            from './NotFound.tsx'
import Shield              from './Shield.tsx'
import SiteMark            from './SiteMark.tsx'
import './style.css'
import './credit.css'
import './credits.css'
import './footnotes.css'

export default {
  extends: DefaultTheme,

  Layout: () => h(DefaultTheme.Layout, null, {
    'doc-after'            : () => h(Shield, { class: 'mx-auto mt-12' }),
    'nav-bar-title-before' : () => h(SiteMark),
    'not-found'            : () => h(NotFound)
  }),

  enhanceApp: ({ app }) => {
    app.component('Credits', Credits)
    app.component('GuideFigures', GuideFigures)
    app.component('HomeMap', defineClientComponent(() => import('./HomeMap.tsx')))
    app.component('LookAngles', defineClientComponent(() => import('./LookAngles.tsx')))
    app.component('OrbitAges', defineClientComponent(() => import('./OrbitAges.tsx')))
    app.component('PeakSearch', defineClientComponent(() => import('./PeakSearch.tsx')))
  },

  setup: () => onMounted(() => followFootnotes(document))
} satisfies Theme
