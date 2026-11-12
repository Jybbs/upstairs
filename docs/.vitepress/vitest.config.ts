import vue              from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  cacheDir : '../.cache/vite',
  plugins  : [vue()],

  test: {
    include  : ['.vitepress/tests/**/*.test.ts'],
    coverage : {
      include          : ['.vitepress/{catalog,preview,lib,theme,tools}/**/*.{ts,vue}'],
      provider         : 'istanbul',
      reportOnFailure  : true,
      reporter         : ['text', 'html', 'json-summary'],
      reportsDirectory : '../.cache/coverage',
      thresholds       : { branches: 28, functions: 51, lines: 34, statements: 34 }
    }
  }
})
