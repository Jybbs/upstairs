import { existsSync, globSync } from 'node:fs'
import { join }                 from 'node:path'

import { describe, expect, it } from 'vitest'
import { type CliOptions, createVitest } from 'vitest/node'

import { READS, ROOT, declares, readersOf, watchedOf } from './common/reads.ts'

const AUDIT = 'docs/.vitepress/tests/tools/audit.test.ts'
const CHECK = 'docs/.vitepress/tests/tools/check.test.ts'
const GONE  = 'docs/.vitepress/tests/gone.test.ts'
const PAGE  = join(ROOT, 'docs/gone/index.md')
const PAGES = ['cards', 'markdown', 'sections'].map(name => join(ROOT, `docs/.vitepress/tests/lib/site/${name}.test.ts`))

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

describe('the reads plugin', () => {
  it('selects the tests reading a changed file they never import', async () =>
    expect(await selected({ related: [join(ROOT, 'docs/.vitepress/tests/common/bin/gh')] }))
      .toEqual([join(ROOT, 'docs/.vitepress/tests/tools/sync.test.ts')]))

  it('selects the tests reading a deleted file', async () =>
    expect(await selected({ changed: true, experimental: { vcsProvider: { findChangedFiles: async () => [PAGE] } } }))
      .toEqual(PAGES))
})
