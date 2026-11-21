import { exec, execFile, execFileSync, execSync, fork, spawn, spawnSync } from 'node:child_process'
import fs, {
  copyFileSync,
  cpSync,
  createReadStream,
  existsSync,
  globSync,
  opendir,
  opendirSync,
  readFileSync,
  readdir,
  readdirSync
} from 'node:fs'
import * as promises               from 'node:fs/promises'
import { tmpdir }                  from 'node:os'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL }           from 'node:url'
import { promisify }               from 'node:util'

import { $, Glob }                                        from 'bun'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { type CliOptions, createVitest }                  from 'vitest/node'

import * as gh from './common/gh.ts'
import {
  CHECKS,
  READS,
  ROOT,
  TABLE,
  declares,
  readersOf,
  readersOfGone,
  rereadOf,
  watchedOf
} from './common/reads.ts'
import TABLE_TEXT from './common/reads.ts?raw'
import { reads }  from './vitest.config.ts'

const AUDIT    = 'docs/.vitepress/tests/tools/audit.test.ts'
const CHECK    = 'docs/.vitepress/tests/tools/check.test.ts'
const DRAWN    = join(ROOT, 'docs/.vitepress/tests/lib/state/drawings.test.ts')
const FIXTURES = join(ROOT, 'docs/.vitepress/tests/fixtures')
const GH       = join(ROOT, 'docs/.vitepress/tests/common/bin/gh')
const GONE     = 'docs/.vitepress/tests/gone.test.ts'
const LOOKS    = join(ROOT, 'docs/.vitepress/tests/lib/orbit/looks.test.ts')
const ORPHAN   = join(ROOT, 'LICENSE')
const PAGE     = join(ROOT, 'docs/gone/index.md')
const PAGES    = ['cards', 'markdown', 'sections']
  .map(name => join(ROOT, `docs/.vitepress/tests/lib/site/${name}.test.ts`))
const SOURCES  = join(ROOT, 'rust/src')
const SYNC     = join(ROOT, 'docs/.vitepress/tests/tools/sync.test.ts')

/**
 * The tests loading the crate's build under `rust/pkg/`, by their paths from
 * the folder of the suite.
 */
const BUILT = [
  'lib/orbit/catalog.test.ts', 'lib/orbit/looks.test.ts', 'lib/orbit/worker.test.ts',
  'lib/state/drawings.test.ts', 'theme/LookAngles.test.ts', 'theme/OrbitAges.test.ts',
  'theme/PeakSearch.test.ts', 'theme/index.test.ts'
]

const gitConfig = () =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('GIT_CONFIG_')))

/**
 * The folder holding the module cache every selection in the file shares.
 */
let cache: string

beforeAll(async () => {
  const scratch = await promises.mkdtempDisposable(join(tmpdir(), 'upstairs-reads-'))
  cache         = scratch.path
  return () => scratch.remove()
})

const selected = async (options: CliOptions) => {
  const vitest = await createVitest({
    config            : join(ROOT, 'docs/.vitepress/tests/vitest.config.ts'),
    fsModuleCachePath : cache,
    root              : join(ROOT, 'docs'),
    watch             : false,
    ...options
  })
  try {
    return (await vitest.getRelevantTestSpecifications()).map(spec => spec.moduleId).sort()
  } finally {
    await vitest.close()
  }
}

/**
 * Selects the tests a run under `--changed`, given `changed` as its ref or
 * `true` for the working tree, reaches where git lists the files
 * `findChangedFiles` returns.
 */
const selectedAfter = (findChangedFiles: () => Promise<string[]>, changed: string | true = true) =>
  selected({ changed, experimental: { vcsProvider: { findChangedFiles } } })

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

describe('rereadOf', () => {
  const TABLED = "export const READS = {\n  'a.ts' : ['a'],\n  'b.ts' : ['b']\n}\nexport const ROOT = '/'\n"

  const edited = (from: string, to: string) => TABLED.replace(from, to)

  it.each<[string, string, string[]]>([
    ['the checks of READS alone for a table left as it was', TABLED, [CHECKS]],
    ['the checks of READS alone for a realigned table', edited("a.ts' :", "a.ts'   :"), [CHECKS]],
    ['a module whose globs the edit changes', edited("['a']", "['a', 'c']"), ['a.ts', CHECKS]],
    ['a module whose entry the edit adds', edited("['b']", "['b'],\n  'c.ts' : ['c']"), ['c.ts', CHECKS]],
    ['a module whose entry the edit removes', edited("  'a.ts' : ['a'],\n", ''), ['a.ts', CHECKS]],
    ['the module itself for an edit outside the table', edited("'/'", "'/root'"), [TABLE]]
  ])('lists %s', async (_, after, reached) =>
    expect(await rereadOf(TABLED, after)).toEqual(reached.map(file => resolve(ROOT, file))))

  it.each([
    ['a version holds no table', 'export const ROOT = 1\n'],
    ['a version spreads another table into READS', edited("'b.ts' : ['b']", '...OTHER')],
    ['git holds no earlier version', undefined]
  ])('lists the module itself where %s', async (_, before) =>
    expect(await rereadOf(before, TABLED)).toEqual([TABLE]))
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
    await selectedAfter(findChangedFiles)
    expect(seen).toEqual([{
      ...before,
      GIT_CONFIG_COUNT   : '2',
      GIT_CONFIG_KEY_1   : 'diff.renames',
      GIT_CONFIG_VALUE_1 : 'false'
    }])
    expect(gitConfig()).toEqual(before)
  })

  it('selects the tests reading a changed file they never import', { tags: ['slow'] }, async () =>
    expect(await selected({ related: [GH] })).toEqual([CHECKS, SYNC]))

  it(
    'selects the tests reading a deleted file and the checks of READS, beside the changed files',
    { tags: ['slow'] },
    async () => {
      expect(await selectedAfter(async () => [GH, PAGE])).toEqual([...PAGES, CHECKS, SYNC].sort())
    }
  )

  it.each<[string, string, string[]]>([
    ["the crate's sources", 'rust/src/lib.rs', BUILT],
    ["the crate's manifest", 'rust/Cargo.toml', [...BUILT, 'lib/site/licenses.test.ts'].sort()],
    ["the crate's lockfile", 'rust/Cargo.lock', [...BUILT, 'lib/site/provenance.test.ts'].sort()],
    ["the crate's own tests, which its build leaves out", 'rust/tests/answers/main.rs', []],
    ['the cargo-deny settings under rust/.cargo/', 'rust/.cargo/deny.toml', []],
    ['a file under docs/public/ that one test reads', 'docs/public/_headers', ['config.test.ts']],
    ['a badge no test reads', 'docs/public/badges/rust.svg', []]
  ])('selects the tests an edit to %s reaches', { tags: ['slow'] }, async (_, file, tests) => {
    expect(await selectedAfter(async () => [join(ROOT, file)]))
      .toEqual(tests.map(test => join(ROOT, 'docs/.vitepress/tests', test)))
  })

  /**
   * The text of this module with an empty `READS` entry for `test`, an
   * absolute path, ahead of every other entry.
   */
  const adding = (test: string) => TABLE_TEXT.replace('= {\n', `= {\n  '${relative(ROOT, test)}': [],\n`)

  /**
   * Makes a scratch repository on `main`, which `GIT_DIR` names until the case
   * ends, returning a function running git in it and one committing `text` as
   * this module, and removing the repository once disposed.
   */
  const scratchRepo = async () => {
    const scratch = await promises.mkdtempDisposable(join(tmpdir(), 'upstairs-reads-git-'))
    const git     = (...args: string[]) =>
      $`git -c user.email=reads@upstairs.fyi -c user.name=reads ${args}`.cwd(scratch.path).quiet()
    const commit = async (text: string) => {
      await Bun.write(join(scratch.path, relative(ROOT, TABLE)), text)
      await git('add', '--all')
      await git('commit', '--message=table', '--quiet')
    }
    await git('init', '--initial-branch=main', '--quiet')
    vi.stubEnv('GIT_DIR', join(scratch.path, '.git'))
    return { commit, git, [Symbol.asyncDispose]: () => scratch.remove() }
  }

  it(
    'selects the tests loading a module whose READS entry an edit changes, beside the checks of READS',
    { tags: ['slow'] },
    async () => {
      await using repo = await scratchRepo()
      await repo.commit(adding(LOOKS))
      expect(await selectedAfter(async () => [TABLE])).toEqual([CHECKS, LOOKS].sort())
    }
  )

  it(
    'compares READS against its merge base with the branch --changed names',
    { tags: ['slow'] },
    async () => {
      await using repo = await scratchRepo()
      await repo.commit(adding(LOOKS))
      await repo.git('switch', '--create', 'topic', '--quiet')
      await repo.commit(TABLE_TEXT)
      await repo.git('switch', 'main', '--quiet')
      await repo.commit(adding(DRAWN))
      await repo.git('switch', 'topic', '--quiet')
      expect(await selectedAfter(async () => [TABLE], 'main')).toEqual([CHECKS, LOOKS].sort())
    }
  )
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
    ['reads', 'readFile', () => promises.readFile(ORPHAN)],
    ['reads', 'readFile of fs.promises', () => fs.promises.readFile(ORPHAN)],
    ['reads', 'readFile of the default export of node:fs/promises', async () =>
      (await import('node:fs/promises')).default.readFile(ORPHAN)],
    ['reads', 'exists', () => new Promise(done => fs.exists(ORPHAN, done))],
    ['reads', 'exists through promisify', () => promisify(fs.exists)(ORPHAN)],
    ['reads', 'Bun.file', () => Bun.file(ORPHAN).text()],
    ['reads', 'globSync', () => globSync('LICENSE', { cwd: ROOT })],
    ['reads', 'glob', () => Array.fromAsync(promises.glob('LICENSE', { cwd: ROOT }))],
    ['reads', 'glob of node:fs', () => new Promise((done, fail) =>
      fs.glob('LICENSE', { cwd: ROOT }, (error, found) => error ? fail(error) : done(found)))],
    ['reads', 'Glob.scanSync', () => [...new Glob('LICENSE').scanSync(ROOT)]],
    ['reads', 'Glob.scan', () => Array.fromAsync(new Glob('LICENSE').scan(ROOT))],
    ['runs', "Bun's shell", () => $`cat ${ORPHAN}`.quiet()],
    ['runs', "Bun's shell from the folder its cwd gives", () => $`cat LICENSE`.cwd(ROOT).quiet()],
    ['runs', 'Bun.spawn', () => Bun.spawn(['cat', ORPHAN]).exited],
    ['runs', 'Bun.spawn on one options object', () => Bun.spawn({ cmd: ['cat', ORPHAN] }).exited],
    ['runs', 'Bun.spawnSync', () => Bun.spawnSync(['cat', ORPHAN])],
    ['runs', 'spawnSync', () => spawnSync('cat', [ORPHAN])],
    ['runs', 'spawnSync with no arguments', () => spawnSync(ORPHAN)],
    ['runs', 'spawnSync from the cwd its options give', () => spawnSync('cat', ['LICENSE'], { cwd: ROOT })],
    ['runs', 'execFile', () => execFile('cat', [ORPHAN])],
    ['runs', 'execFileSync', () => execFileSync('cat', [ORPHAN])],
    ['runs', 'execSync', () => execSync(`cat ${ORPHAN}`)],
    ['runs', 'exec', () => exec(`cat ${ORPHAN}`)],
    ['runs', 'fork', () => fork(ORPHAN)],
    ['runs', 'spawn', () => spawn('cat', [ORPHAN])]
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

  it.each([
    'access', 'accessSync', 'lstat', 'lstatSync', 'open', 'openSync', 'readlink', 'readlinkSync', 'stat', 'statSync'
  ] as const)('fails a test that reads an undeclared file through %s of the default export', name => {
    const read = fs[name] as (path: string, done: () => void) => void
    expect(() => read(ORPHAN, () => {})).toThrow(refused('reads'))
  })

  it.each(['access', 'lstat', 'open', 'readlink', 'stat'] as const)(
    'fails a test that reads an undeclared file through %s of node:fs/promises', name =>
      expect(async () => promises[name](ORPHAN)).rejects.toThrow(refused('reads')))

  it.each([
    ['readdirSync', () => readdirSync(SOURCES)],
    ['readdirSync on a path relative to the working folder', () =>
      readdirSync('../rust/src', { withFileTypes: true })],
    ['readdirSync naming each entry by a buffer', () => readdirSync(SOURCES, { encoding: 'buffer' })],
    ['readdir', () => promisify(readdir)(SOURCES)],
    ['readdir of node:fs/promises', () => promises.readdir(SOURCES)],
    ['opendir', () => promisify(opendir)(SOURCES)],
    ['opendirSync', () => opendirSync(SOURCES)],
    ['opendir of node:fs/promises', () => promises.opendir(SOURCES)]
  ])('fails a test listing a folder of undeclared files through %s', (_, list) =>
    expect(async () => list()).rejects.toThrow(refused('reads', 'rust/src/\\S+')))

  it('fails a test listing the folders below a folder through opendirSync', () =>
    expect(() => opendirSync(join(ROOT, 'docs/.vitepress/tests/lib'), { recursive: true }))
      .toThrow(refused('reads', 'docs/\\.vitepress/tests/lib/\\S+')))

  it('fails a test copying a folder whose undeclared files follow a declared one', () =>
    expect(() => cpSync(FIXTURES, join(tmpdir(), 'upstairs-reads-fixtures'), { recursive: true }))
      .toThrow(refused('reads', 'docs/\\.vitepress/tests/fixtures/\\S+')))

  it('fails a test copying a folder that holds an undeclared file', () =>
    expect(() => cpSync(SOURCES, join(tmpdir(), 'upstairs-reads-copy'), { recursive: true }))
      .toThrow(refused('reads', 'rust/src/\\S+')))

  it('passes a glob matching only a folder', () =>
    expect(() => globSync('rust', { cwd: ROOT })).not.toThrow())

  it('passes a read under the temporary folder, wherever it lies', () => {
    vi.stubEnv('TMPDIR', FIXTURES)
    expect(() => readFileSync(join(FIXTURES, 'photon.json'))).not.toThrow()
  })

  it('passes a read of a file outside the worktree', () =>
    expect(() => existsSync(join(ROOT, '../LICENSE'))).not.toThrow())
})
