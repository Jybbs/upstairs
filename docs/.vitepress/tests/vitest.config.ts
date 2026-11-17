import { resolve } from 'node:path'

import vueJsx                           from '@vitejs/plugin-vue-jsx'
import { configDefaults, defineConfig } from 'vitest/config'

const triggers = [
  '.github/**', '.mise/**', 'docs/**/*.{css,md}', 'docs/.vitepress/lib/site/references.bib',
  'docs/.vitepress/tests/common/{bin,check}/**', 'docs/.vitepress/tests/fixtures/**', 'docs/bun.lock',
  'docs/package.json', 'docs/public/**', 'rust/**'
].map(glob => resolve(import.meta.dirname, '../../..', glob))

export default defineConfig({
  cacheDir : '../.cache/vite',
  plugins  : [vueJsx()],

  test: {
    env                : { TZ: 'UTC' },
    forceRerunTriggers : [...configDefaults.forceRerunTriggers, ...triggers],
    include            : ['.vitepress/tests/**/*.test.ts'],
    testTimeout        : 30_000,
    coverage           : {
      include          : ['.vitepress/{catalog,preview,lib,theme,tools}/**/*.{ts,tsx}'],
      provider         : 'istanbul',
      reportOnFailure  : true,
      reporter         : ['text', 'html', 'json-summary'],
      reportsDirectory : '../.cache/coverage',
      thresholds       : { branches: 84, functions: 89, lines: 91, statements: 90 }
    }
  }
})
