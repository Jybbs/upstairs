import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  cacheDir     : '.cache/vite',
  optimizeDeps : { exclude: ['maplibre-gl'] },
  plugins      : [vue(), tailwindcss()],
  worker       : { format: 'es' },

  test: {
    coverage: {
      include          : ['catalog/**/*.ts', 'src/**', 'tools/**'],
      provider         : 'v8',
      reporter         : ['text', 'html'],
      reportOnFailure  : true,
      reportsDirectory : '.cache/coverage',
      thresholds       : { branches: 19, functions: 42, lines: 27, statements: 27 }
    },
    include: ['tests/**/*.test.ts']
  }
})
