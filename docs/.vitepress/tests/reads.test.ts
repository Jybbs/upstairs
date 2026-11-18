import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { READS, ROOT, declares, watchedOf } from './common/reads.ts'

const AUDIT = 'docs/.vitepress/tests/tools/audit.test.ts'
const CHECK = 'docs/.vitepress/tests/tools/check.test.ts'
const GONE  = 'docs/.vitepress/tests/gone.test.ts'

describe('declares', () => {
  it.each([
    ['the file its glob names', AUDIT, '.mise/tasks/lock/audit', true],
    ['a file beside it', AUDIT, '.mise/tasks/lock/sync', false],
    ['a file a brace glob matches', CHECK, '.mise/tasks/site/typecheck', true],
    ['any file for a test READS leaves out', GONE, '.mise/tasks/lock/audit', false]
  ])('answers for %s', (_, test, file, declared) => expect(declares(file, join(ROOT, test))).toBe(declared))
})

describe('watchedOf', () => {
  it('resolves every module and glob READS declares, keyed by absolute path', () =>
    expect([...watchedOf().keys()]).toEqual(Object.keys(READS).map(module => join(ROOT, module))))

  it('maps a module to the absolute path of each file its globs match', () =>
    expect(watchedOf({ [AUDIT]: ['.mise/tasks/lock/{audit,sync}'] }).get(join(ROOT, AUDIT))?.sort())
      .toEqual(['.mise/tasks/lock/audit', '.mise/tasks/lock/sync'].map(file => join(ROOT, file))))

  it.each([
    ['a missing module', { [GONE]: ['docs/bun.lock'] }, /gone\.test\.ts, which is missing/],
    ['a glob matching no file', { [AUDIT]: ['.mise/tasks/lock/gone'] }, /lock\/gone, which matches no file/]
  ])('throws on %s', (_, reads, message) => expect(() => watchedOf(reads)).toThrow(message))
})
