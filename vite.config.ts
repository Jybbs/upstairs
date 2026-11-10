import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  cacheDir     : '.cache/vite',
  optimizeDeps : { exclude: ['maplibre-gl'] },
  plugins      : [vue(), tailwindcss()],
  worker       : { format: 'es' },
  test         : {
    include  : ['tests/**/*.test.ts'],
    coverage : {
      include          : ['src/**', 'tools/**'],
      provider         : 'v8',
      reporter         : ['text', 'html'],
      reportOnFailure  : true,
      reportsDirectory : '.cache/coverage',
      thresholds       : { branches: 17, functions: 44, lines: 23, statements: 22 }
    }
  }
})
