import { resolve } from 'node:path'

import vue                              from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

const triggers = [
  '.github/**', '.mise/**', 'docs/**/*.{css,md}', 'docs/.vitepress/tests/fixtures/**',
  'docs/bun.lock', 'docs/public/**', 'docs/references.bib', 'rust/**'
].map(glob => resolve(import.meta.dirname, '../..', glob))

export default defineConfig({
  cacheDir : '../.cache/vite',
  plugins  : [vue()],

  test: {
    forceRerunTriggers : [...configDefaults.forceRerunTriggers, ...triggers],
    include            : ['.vitepress/tests/**/*.test.ts'],
    coverage           : {
      include          : ['.vitepress/{catalog,preview,lib,theme,tools}/**/*.{ts,vue}'],
      provider         : 'istanbul',
      reportOnFailure  : true,
      reporter         : ['text', 'html', 'json-summary'],
      reportsDirectory : '../.cache/coverage',
      thresholds       : { branches: 84, functions: 89, lines: 91, statements: 90 }
    }
  }
})
