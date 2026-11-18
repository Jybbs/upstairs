import { existsSync } from 'node:fs'
import { join }       from 'node:path'

import vueJsx                           from '@vitejs/plugin-vue-jsx'
import type { Plugin }                  from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

import { ROOT, readersOf, watchedOf } from './common/reads.ts'

const triggers = [
  '.mise/config.toml', '.mise/mise.lock', 'docs/bun.lock', 'rust/{Cargo.lock,Cargo.toml,src/**}'
].map(glob => join(ROOT, glob))
const watched = watchedOf()

const reads: Plugin = {
  name: 'reads',
  configureVitest({ defineCacheKeyGenerator, vitest }) {
    defineCacheKeyGenerator(({ id }) => watched.get(id)?.join('\n'))
    const { vcs } = vitest
    vitest.vcs = {
      findChangedFiles: async options => {
        const files = await vcs.findChangedFiles(options)
        return [...files, ...files.filter(file => !existsSync(file)).flatMap(file => readersOf(file))]
      }
    }
  },
  transform: {
    filter: { id: [...watched.keys()] },
    handler(_, id) {
      watched.get(id)?.forEach(file => this.addWatchFile(file))
    }
  }
}

export default defineConfig({
  cacheDir : '../.cache/vite',
  plugins  : [vueJsx(), reads],

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
