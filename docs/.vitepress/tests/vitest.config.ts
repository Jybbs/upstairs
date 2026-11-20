import { existsSync } from 'node:fs'
import { join }       from 'node:path'

import vueJsx                           from '@vitejs/plugin-vue-jsx'
import type { Plugin }                  from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import type { Vitest }                  from 'vitest/node'

import { ROOT, readersOfGone, watchedOf } from './common/reads.ts'

const triggers = [
  '.mise/config.toml', '.mise/mise.lock', 'docs/bun.lock', 'rust/{Cargo.lock,Cargo.toml,src/**}'
].map(glob => join(ROOT, glob))
const watched = watchedOf()

const unrenamed = async (find: () => Promise<string[]>): Promise<string[]> => {
  const { env } = process
  const count = Number(env.GIT_CONFIG_COUNT || 0)
  const added = {
    GIT_CONFIG_COUNT              : `${count + 1}`,
    [`GIT_CONFIG_KEY_${count}`]   : 'diff.renames',
    [`GIT_CONFIG_VALUE_${count}`] : 'false'
  }
  const before = Object.keys(added).map(key => [key, env[key]] as const)
  Object.assign(env, added)
  try {
    return await find()
  } finally {
    before.forEach(([key, value]) => value === undefined ? Reflect.deleteProperty(env, key) : (env[key] = value))
  }
}

export const reads = {
  name: 'reads',
  configureVitest({ defineCacheKeyGenerator, vitest }: {
    defineCacheKeyGenerator : (generator: (context: { id: string }) => string | undefined) => void
    vitest                  : Pick<Vitest, 'vcs'>
  }) {
    defineCacheKeyGenerator(({ id }) => watched.get(id)?.join('\n'))
    const { vcs } = vitest
    vitest.vcs = {
      findChangedFiles: async options => {
        const files = await unrenamed(() => vcs.findChangedFiles(options))
        return [...files, ...readersOfGone(files.filter(file => !existsSync(file)))]
      }
    }
  },
  transform: {
    filter: { id: [...watched.keys()] },
    handler(_, id) {
      watched.get(id)?.forEach(file => this.addWatchFile(file))
    }
  }
} satisfies Plugin

export default defineConfig({
  cacheDir : '../.cache/vite',
  plugins  : [vueJsx(), reads],

  test: {
    env                : { TZ: 'UTC' },
    forceRerunTriggers : [...configDefaults.forceRerunTriggers, ...triggers],
    include            : ['.vitepress/tests/**/*.test.ts'],
    tags               : [{ description: 'A case taking more than a second when run alone', name: 'slow' }],
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
