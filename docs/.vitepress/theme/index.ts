import '@fontsource/young-serif'
import '@fontsource-variable/literata'
import '@fontsource-variable/jetbrains-mono'

import { defineClientComponent, type Theme } from 'vitepress'
import DefaultTheme                         from 'vitepress/theme-without-fonts'
import { h }                                from 'vue'

import NotFound from './NotFound.vue'
import './style.css'

export default {
  Layout     : () => h(DefaultTheme.Layout, null, { 'not-found': () => h(NotFound) }),
  extends    : DefaultTheme,
  enhanceApp : ({ app }) => {
    app.component('HomeMap', defineClientComponent(() => import('./HomeMap.vue')))
  }
} satisfies Theme
