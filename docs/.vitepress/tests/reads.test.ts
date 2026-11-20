import { execFile, execFileSync, execSync, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, createReadStream, existsSync, globSync, readFileSync } from 'node:fs'
import { glob, readFile, readdir }                     from 'node:fs/promises'
import { tmpdir }                                      from 'node:os'
import { join, relative }                              from 'node:path'
import { pathToFileURL }                               from 'node:url'

import { $, Glob }                             from 'bun'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type CliOptions, createVitest }       from 'vitest/node'

import * as gh                                                      from './common/gh.ts'
import { READS, ROOT, declares, readersOf, readersOfGone, watchedOf } from './common/reads.ts'
import { reads }                                                    from './vitest.config.ts'

const AUDIT  = 'docs/.vitepress/tests/tools/audit.test.ts'
const CHECK  = 'docs/.vitepress/tests/tools/check.test.ts'
const CHECKS = join(ROOT, 'docs/.vitepress/tests/reads.test.ts')
const GH     = join(ROOT, 'docs/.vitepress/tests/common/bin/gh')
const GONE   = 'docs/.vitepress/tests/gone.test.ts'
const ORPHAN = join(ROOT, 'LICENSE')
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
    ['any file for a test READS leaves out', GONE, '.mise/tasks/lock/audit', false],
    ['any declared file, for the checks of READS', relative(ROOT, CHECKS), '.mise/tasks/lock/audit', true]
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
      await Promise.resolve()
      seen.push(gitConfig())
      return []
    }
    await selected({ changed: true, experimental: { vcsProvider: { findChangedFiles } } })
    expect(seen).toEqual([{ ...before, GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_1: 'diff.renames', GIT_CONFIG_VALUE_1: 'false' }])
    expect(gitConfig()).toEqual(before)
  })

  it('selects the tests reading a changed file they never import', async () =>
    expect(await selected({ related: [GH] })).toEqual([CHECKS, SYNC]))

  it('selects the tests reading a deleted file and the checks of READS, beside the changed files', async () =>
    expect(await selected({ changed: true, experimental: { vcsProvider: { findChangedFiles: async () => [GH, PAGE] } } }))
      .toEqual([...PAGES, CHECKS, SYNC].sort()))
})

describe('the read check', () => {
  afterEach(() => vi.unstubAllEnvs())

  const refused = (verb: string, file = 'LICENSE') =>
    new RegExp(`^${CHECKS} ${verb} ${file}, which READS gives it no glob for$`)

  it.each([
    ['reads', 'readFileSync', () => readFileSync(ORPHAN)],
    ['reads', 'readFileSync on a file URL', () => readFileSync(pathToFileURL(ORPHAN))],
    ['reads', 'readFileSync on a buffer', () => readFileSync(Buffer.from(ORPHAN))],
    ['reads', 'readFileSync on a path relative to the working folder', () => readFileSync('../LICENSE')],
    ['reads', 'existsSync', () => existsSync(ORPHAN)],
    ['reads', 'copyFileSync', () => copyFileSync(ORPHAN, join(tmpdir(), 'upstairs-reads-copy'))],
    ['reads', 'createReadStream', () => createReadStream(ORPHAN).close()],
    ['reads', 'readFile', () => readFile(ORPHAN)],
    ['reads', 'Bun.file', () => Bun.file(ORPHAN).text()],
    ['reads', 'globSync', () => globSync('LICENSE', { cwd: ROOT })],
    ['reads', 'glob', () => Array.fromAsync(glob('LICENSE', { cwd: ROOT }))],
    ['reads', 'Glob.scanSync', () => [...new Glob('LICENSE').scanSync(ROOT)]],
    ['reads', 'Glob.scan', () => Array.fromAsync(new Glob('LICENSE').scan(ROOT))],
    ['runs', "Bun's shell", () => $`cat ${ORPHAN}`.quiet()],
    ['runs', 'Bun.spawn', () => Bun.spawn(['cat', ORPHAN]).exited],
    ['runs', 'Bun.spawn on one options object', () => Bun.spawn({ cmd: ['cat', ORPHAN] }).exited],
    ['runs', 'Bun.spawnSync', () => Bun.spawnSync(['cat', ORPHAN])],
    ['runs', 'spawnSync', () => spawnSync('cat', [ORPHAN])],
    ['runs', 'spawnSync with no arguments', () => spawnSync(ORPHAN)],
    ['runs', 'spawnSync from the cwd its options give', () => spawnSync('cat', ['LICENSE'], { cwd: ROOT })],
    ['runs', 'execFile', () => execFile('cat', [ORPHAN])],
    ['runs', 'execFileSync', () => execFileSync('cat', [ORPHAN])],
    ['runs', 'execSync', () => execSync(`cat ${ORPHAN}`)]
  ])('fails a test that %s an undeclared file through %s', (verb, _, touch) =>
    expect(async () => touch()).rejects.toThrow(refused(verb)))

  it('fails a test whose gh stand-in copies a file no module declares', async ({ onTestFinished }) => {
    const declared = Object.entries(READS)
    declared.forEach(([module]) => Reflect.deleteProperty(READS, module))
    onTestFinished(() => {
      Object.assign(READS, Object.fromEntries(declared))
    })
    await expect(gh.Run.of('labels', { failures: {}, labels: [], rulesets: [] }))
      .rejects.toThrow(refused('reads', '\\.github/\\S+'))
  })

  it('fails a test copying a folder that holds an undeclared file', () =>
    expect(() => cpSync(join(ROOT, 'rust/src'), join(tmpdir(), 'upstairs-reads-copy'), { recursive: true }))
      .toThrow(refused('reads', 'rust/src/\\S+')))

  it('fails a test listing a folder of undeclared files through readdir', () =>
    expect(readdir(join(ROOT, 'rust/src'))).rejects.toThrow(refused('reads', 'rust/src/\\S+')))

  it('passes a glob matching only a folder', () =>
    expect(() => globSync('rust', { cwd: ROOT })).not.toThrow())

  it('passes a read under the temporary folder, wherever it lies', () => {
    vi.stubEnv('TMPDIR', join(ROOT, 'docs/.vitepress/tests/fixtures'))
    expect(() => readFileSync(join(ROOT, 'docs/.vitepress/tests/fixtures/photon.json'))).not.toThrow()
  })

  it('passes a read of a file outside the worktree', () =>
    expect(() => existsSync(join(ROOT, '../LICENSE'))).not.toThrow())
})
