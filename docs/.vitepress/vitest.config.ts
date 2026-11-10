import vue              from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  cacheDir : '../.cache/vite',
  plugins  : [vue()],

  test: {
    include  : ['.vitepress/tests/**/*.test.ts'],
    coverage : {
      include          : ['.vitepress/{lib,theme,tools}/**'],
      provider         : 'v8',
      reportOnFailure  : true,
      reporter         : ['text', 'html'],
      reportsDirectory : '../.cache/coverage',
      thresholds       : { branches: 19, functions: 45, lines: 23, statements: 23 }
    }
  }
})
