import { existsSync, globSync } from 'node:fs'
import { join }                 from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { type CliOptions, createVitest } from 'vitest/node'

import { READS, ROOT, declares, readersOf, readersOfGone, watchedOf } from './common/reads.ts'
import { reads }                                                    from './vitest.config.ts'

const AUDIT  = 'docs/.vitepress/tests/tools/audit.test.ts'
const CHECK  = 'docs/.vitepress/tests/tools/check.test.ts'
const CHECKS = join(ROOT, 'docs/.vitepress/tests/reads.test.ts')
const GH     = join(ROOT, 'docs/.vitepress/tests/common/bin/gh')
const GONE   = 'docs/.vitepress/tests/gone.test.ts'
const PAGE   = join(ROOT, 'docs/gone/index.md')
const PAGES  = ['cards', 'markdown', 'sections'].map(name => join(ROOT, `docs/.vitepress/tests/lib/site/${name}.test.ts`))
const SYNC   = join(ROOT, 'docs/.vitepress/tests/tools/sync.test.ts')

const gitConfig = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('GIT_CONFIG_')))

const selected = async (options: CliOptions) => {
  const vitest = await createVitest({
    config        : join(ROOT, 'docs/.vitepress/tests/vitest.config.ts'),
    fsModuleCache : false,
    root          : join(ROOT, 'docs'),
    watch         : false,
    ...options
  })
  try {
    return (await vitest.getRelevantTestSpecifications()).map(spec => spec.moduleId).sort()
  } finally {
    await vitest.close()
  }
}

describe('declares', () => {
  it.each([
    ['the file its glob names', AUDIT, '.mise/tasks/lock/audit', true],
    ['a file beside it', AUDIT, '.mise/tasks/lock/sync', false],
    ['a file a brace glob matches', CHECK, '.mise/tasks/site/typecheck', true],
    ['any file for a test READS leaves out', GONE, '.mise/tasks/lock/audit', false]
  ])('answers for %s', (_, test, file, declared) => expect(declares(file, join(ROOT, test))).toBe(declared))
})

describe('watchedOf', () => {
  it('keys every module READS declares by its absolute path', () =>
    expect([...watchedOf().keys()]).toEqual(Object.keys(READS).map(module => join(ROOT, module))))

  it('maps a module to the absolute path of each file its globs match', () =>
    expect(watchedOf({ [AUDIT]: ['.mise/tasks/lock/{audit,sync}'] }).get(join(ROOT, AUDIT))?.sort())
      .toEqual(['.mise/tasks/lock/audit', '.mise/tasks/lock/sync'].map(file => join(ROOT, file))))

  it('maps a module to no file where its globs match none', () =>
    expect(watchedOf({ [AUDIT]: ['.mise/tasks/lock/gone'] }).get(join(ROOT, AUDIT))).toEqual([]))

  it.each(Object.entries(READS))('finds %s and a file for each of its globs', (module, globs) => {
    expect(existsSync(join(ROOT, module))).toBe(true)
    globs.forEach(glob => expect(globSync(glob, { cwd: ROOT }), glob).not.toEqual([]))
  })
})

describe('readersOf', () => {
  it('lists each module whose glob matches a file, missing or present', () =>
    expect(readersOf(PAGE).sort()).toEqual(PAGES))
})

describe('readersOfGone', () => {
  it.each([
    ['the readers of a deleted file a glob matches', [PAGE], [...PAGES, CHECKS]],
    ['a deleted module READS declares', [join(ROOT, GONE)], [CHECKS]],
    ['nothing for a deleted file READS leaves out', [join(ROOT, 'docs/gone.txt')], []]
  ])('lists %s', (_, gone, readers) =>
    expect(readersOfGone(gone, { ...READS, [GONE]: [] }).sort()).toEqual(readers.sort()))
})

describe('the reads plugin', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keys the cache of a declared module by the files its globs match', () => {
    const keys: (string | undefined)[] = []
    reads.configureVitest({
      defineCacheKeyGenerator : generator => keys.push(generator({ id: join(ROOT, AUDIT) })),
      vitest                  : { vcs: { findChangedFiles: async () => [] } }
    })
    expect(keys).toEqual([watchedOf().get(join(ROOT, AUDIT))?.join('\n')])
  })

  it('lists the changes with rename detection off, after any git config already set', async () => {
    const seen: Record<string, string | undefined>[] = []
    Object.entries({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.quotePath', GIT_CONFIG_VALUE_0: 'false' })
      .forEach(([key, value]) => vi.stubEnv(key, value))
    const before = gitConfig()
    const findChangedFiles = async () => {
      seen.push(gitConfig())
      return []
    }
    await selected({ changed: true, experimental: { vcsProvider: { findChangedFiles } } })
    expect(seen).toEqual([{ ...before, GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_1: 'diff.renames', GIT_CONFIG_VALUE_1: 'false' }])
    expect(gitConfig()).toEqual(before)
  })

  it('selects the tests reading a changed file they never import', async () =>
    expect(await selected({ related: [GH] })).toEqual([SYNC]))

  it('selects the tests reading a deleted file and the checks of READS, beside the changed files', async () =>
    expect(await selected({ changed: true, experimental: { vcsProvider: { findChangedFiles: async () => [GH, PAGE] } } }))
      .toEqual([...PAGES, CHECKS, SYNC].sort()))
})
