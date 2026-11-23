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

import { $, Glob }                             from 'bun'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
import { PAGE, PAGES } from './common/selections.ts'
import { reads }       from './vitest.config.ts'

const AUDIT    = 'docs/.vitepress/tests/tools/audit.test.ts'
const CHECK    = 'docs/.vitepress/tests/tools/check.test.ts'
const FIXTURES = join(ROOT, 'docs/.vitepress/tests/fixtures')
const GONE     = 'docs/.vitepress/tests/gone.test.ts'
const ORPHAN   = join(ROOT, 'LICENSE')
const SOURCES  = join(ROOT, 'rust/src')

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
  it('keys the cache of a declared module by the files its globs match', () => {
    const keys: (string | undefined)[] = []
    reads.configureVitest({
      defineCacheKeyGenerator : generator => keys.push(generator({ id: join(ROOT, AUDIT) })),
      vitest                  : { vcs: { findChangedFiles: async () => [] } }
    })
    expect(keys).toEqual([watchedOf().get(join(ROOT, AUDIT))?.join('\n')])
  })
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
    ['reads', 'fetch of a file URL string', () => fetch(pathToFileURL(ORPHAN).href)],
    ['reads', 'fetch of a file URL', () => fetch(pathToFileURL(ORPHAN))],
    ['reads', 'fetch of a Request for a file URL', () => fetch(new Request(pathToFileURL(ORPHAN)))],
    ['runs', "Bun's shell", () => $`cat ${ORPHAN}`.quiet()],
    ['runs', "Bun's shell from the folder its cwd gives", () => $`cat LICENSE`.cwd(ROOT).quiet()],
    ['runs', "Bun's shell from the folder $.cwd gives", async () => {
      $.cwd(ROOT)
      try {
        await $`cat LICENSE`.quiet()
      } finally {
        $.cwd()
      }
    }],
    ['runs', 'a shell new $.Shell() makes', () => new $.Shell()`cat ${ORPHAN}`.quiet()],
    ['runs', 'a shell new $.Shell() makes, from the folder its cwd gives', () =>
      new $.Shell().cwd(ROOT)`cat LICENSE`.quiet()],
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
    'access', 'accessSync', 'lstat', 'lstatSync', 'open', 'openSync', 'readlink', 'readlinkSync',
    'stat', 'statSync'
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

  it('keeps the setting a shell from new $.Shell() takes through nothrow', () =>
    expect(new $.Shell().nothrow()`false`.quiet()).resolves.toMatchObject({ exitCode: 1 }))

  it("moves the commands of Bun's shell to the folder $.cwd gives", async () => {
    $.cwd(FIXTURES)
    try {
      expect((await $`pwd`.text()).trim()).toBe(FIXTURES)
    } finally {
      $.cwd()
    }
  })

  it('keeps a shell new $.Shell() makes an instance of $.Shell', () =>
    expect(new $.Shell()).toBeInstanceOf($.Shell))

  it("finds cwd and Shell on Bun's shell through an in check", () =>
    expect(['cwd', 'Shell'].filter(key => key in $)).toEqual(['cwd', 'Shell']))

  it('reads the same $.Shell on every access', () => expect($.Shell).toBe($.Shell))

  it('reads no Shell off a shell new $.Shell() makes', () => expect(new $.Shell().Shell).toBeUndefined())

  it('passes a fetch of a URL of another scheme', () =>
    expect(fetch('data:,')).resolves.toBeInstanceOf(Response))

  it('passes a read of a file outside the worktree', () =>
    expect(() => existsSync(join(ROOT, '../LICENSE'))).not.toThrow())
})
