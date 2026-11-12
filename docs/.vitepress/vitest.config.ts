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
      reporter         : ['text', 'html'],
      reportsDirectory : '../.cache/coverage',
      thresholds       : { branches: 84, functions: 89, lines: 91, statements: 90 }
    }
  }
})
