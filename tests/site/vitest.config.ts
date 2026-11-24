import { execFile }                    from 'node:child_process'
import { existsSync, globSync }        from 'node:fs'
import { readFile }                    from 'node:fs/promises'
import { join, matchesGlob, relative } from 'node:path'
import { promisify }                   from 'node:util'

import vueJsx                           from '@vitejs/plugin-vue-jsx'
import type { Plugin }                  from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import type { Vitest }                  from 'vitest/node'

import { ROOT, TABLE, readersOfGone, rereadOf, watchedOf } from './common/reads.ts'

const BUILT    = 'rust/pkg/*'
const CRATE    = 'rust/{Cargo.lock,Cargo.toml,src/**}'
const triggers = ['.mise/config.toml', '.mise/mise.lock', 'bun.lock'].map(glob => join(ROOT, glob))
const watched  = watchedOf()

const git = async (...args: string[]): Promise<string | undefined> =>
  (await promisify(execFile)('git', args, { cwd: ROOT }).catch(() => undefined))?.stdout

const textsOf = async (since?: string | boolean): Promise<[string | undefined, string | undefined]> => {
  const base = typeof since === 'string' ? (await git('merge-base', since, 'HEAD'))?.trim() : 'HEAD'
  return [
    base === undefined ? undefined : await git('show', `${base}:${relative(ROOT, TABLE)}`),
    await readFile(TABLE, 'utf8').catch(() => undefined)
  ]
}

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
    before.forEach(([key, value]) =>
      value === undefined ? Reflect.deleteProperty(env, key) : (env[key] = value))
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
        const built = files.some(file => matchesGlob(relative(ROOT, file), CRATE))
          ? globSync(BUILT, { cwd: ROOT }).map(file => join(ROOT, file))
          : []
        const reread = files.includes(TABLE) ? await rereadOf(...await textsOf(options.changedSince)) : []
        return [
          ...files.filter(file => file !== TABLE), ...reread, ...built,
          ...readersOfGone(files.filter(file => !existsSync(file)))
        ]
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
    dir                : import.meta.dirname,
    env                : { TZ: 'UTC' },
    environmentOptions : { happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: true } } },
    forceRerunTriggers : [...configDefaults.forceRerunTriggers, ...triggers],
    setupFiles         : [join(import.meta.dirname, 'common/held.ts')],
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
