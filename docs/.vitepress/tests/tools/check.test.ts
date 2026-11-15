import { mkdtempDisposable } from 'node:fs/promises'
import { tmpdir }            from 'node:os'
import { delimiter, join }   from 'node:path'

import { $ }                      from 'bun'
import { describe, expect, test } from 'vitest'

import { ROOT } from '../fixtures/gh.ts'

type Change = (repo: Repo) => Promise<unknown>
type Task   = 'crate/affected' | 'site/affected' | 'site/check'

const ANSWERS = 'docs/.vitepress/tests/fixtures/answers.json'
const CHECKED = [
  'run', 'site:lint', ':::', 'site:typecheck', ':::', 'site:affected', ':::', 'crate:affected'
]
const PHOTON  = 'docs/.vitepress/tests/fixtures/photon.json'
const RECORDS = 'docs/.vitepress/tests/fixtures/records.json'
const SKIPPED = /^crate:affected found no change since origin\/main\b/
const standIn = join(import.meta.dirname, '../fixtures/check')
const SEEDED  = {
  '.gitignore'      : '.cache/\n',
  'README.md'       : 'Upstairs\n',
  [ANSWERS]         : '{}\n',
  [PHOTON]          : '{}\n',
  [RECORDS]         : '[]\n',
  'rust/src/lib.rs' : '\n'
}

/**
 * One run of a task, holding each call it made to the stand-in for `mise` as
 * its arguments, its exit status, and what it printed.
 */
interface Run {
  calls  : string[][]
  code   : number
  stdout : string
}

/**
 * A scratch repository holding `SEEDED` in one commit on `main`, which
 * `origin/main` names, where each task runs against the stand-in for `mise`.
 */
class Repo {
  private readonly calls : string
  private readonly env   : Record<string, string>
  private readonly root  : string

  constructor(dir: string) {
    this.calls = join(dir, 'calls')
    this.root  = join(dir, 'repository')
    this.env   = {
      GIT_CONFIG_NOSYSTEM : '1',
      HOME                : dir,
      PATH                : [standIn, process.env.PATH].join(delimiter),
      STAND_IN_CALLS      : this.calls
    }
  }

  static async seeded(dir: string): Promise<Repo> {
    const repo = new Repo(dir)
    await Promise.all(Object.entries(SEEDED).map(([path, text]) => repo.write(path, text)))
    await repo.git('init', '--initial-branch=main', '--quiet')
    await repo.commit()
    await repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    return repo
  }

  /**
   * Commits every change in the working tree, untracked files included.
   */
  async commit(): Promise<void> {
    await this.git('add', '--all')
    await this.git(
      '-c', 'user.email=check@upstairs.fyi', '-c', 'user.name=check', 'commit', '--message=change', '--quiet'
    )
  }

  git(...args: string[]): Promise<string> {
    return $`git ${args}`.cwd(this.root).env(this.env).quiet().text()
  }

  /**
   * The bytes of the repository's own index.
   */
  index(): Promise<Uint8Array> {
    return Bun.file(join(this.root, '.git/index')).bytes()
  }

  /**
   * The trees `site:check` recorded as passing, in the order recorded.
   */
  async passed(): Promise<string[]> {
    const file = Bun.file(join(this.root, '.cache/check/passed'))
    return await file.exists() ? linesOf(await file.text()) : []
  }

  /**
   * Runs the task at `.mise/tasks/<task>` of the worktree from the root of the
   * repository, every call it makes to `mise` exiting with `exit`.
   */
  async run(task: Task, args: string[] = [], exit = 0): Promise<Run> {
    await Bun.write(this.calls, '')
    const result = await $`${join(ROOT, '.mise/tasks', task)} ${args}`
      .cwd(this.root)
      .env({ ...this.env, STAND_IN_EXIT: String(exit) })
      .nothrow()
      .quiet()
    return {
      calls  : linesOf(await Bun.file(this.calls).text()).map(call => call.split('\t')),
      code   : result.exitCode,
      stdout : result.stdout.toString()
    }
  }

  write(path: string, text: string): Promise<number> {
    return Bun.write(join(this.root, path), text)
  }
}

const it = test.extend('repo', async ({ onTestFinished }) => {
  const scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-check-'))
  onTestFinished(() => scratch.remove())
  return Repo.seeded(scratch.path)
})

/**
 * Commits an edit to `path` on a branch of its own, moves `origin/main` to that
 * commit, and switches back to `main`, so the edit sits on `origin/main` alone.
 */
const advanced = (path: string): Change => async repo => {
  await repo.git('switch', '--create', 'advanced', '--quiet')
  await committed(path)(repo)
  await repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  await repo.git('switch', 'main', '--quiet')
}

const committed = (path: string): Change => async repo => {
  await edit(path)(repo)
  await repo.commit()
}

const edit = (...paths: string[]): Change => repo =>
  Promise.all(paths.map(path => repo.write(path, 'edited\n')))

const linesOf = (text: string) => text.split('\n').filter(Boolean)

const staged = (path: string): Change => async repo => {
  await edit(path)(repo)
  await repo.git('add', path)
}

describe('site:check', () => {
  it('calls site:lint, site:typecheck, site:affected, and crate:affected in one mise run', async ({ repo }) =>
    expect((await repo.run('site/check')).calls).toEqual([CHECKED]))

  it.for<[string, Change, string]>([
    ['an edit', edit('README.md'), 'README.md'],
    ['a new file', edit('docs/new.md'), 'docs/new.md'],
    ['a staged change', staged('rust/src/lib.rs'), 'rust/src/lib.rs']
  ])('records the tree holding %s, leaving the index as it found it', async ([, change, path], { repo }) => {
    await change(repo)
    const index = await repo.index()
    await repo.run('site/check')
    const [tree] = await repo.passed()
    expect([await repo.git('show', `${tree}:${path}`), await repo.index()]).toEqual(['edited\n', index])
  })

  it('records nothing for a run whose tasks fail, exiting with their status', async ({ repo }) => {
    const run = await repo.run('site/check', [], 1)
    expect([run.code, await repo.passed()]).toEqual([1, []])
  })

  it.for<[string, Change, string[][]]>([
    ['calls no task over the tree a passing run recorded', edit(), []],
    ['calls every task again once an edit leaves that tree', edit('README.md'), [CHECKED]]
  ])('%s', async ([, change, calls], { repo }) => {
    const passing = await repo.run('site/check')
    await change(repo)
    const again = await repo.run('site/check')
    expect([passing.code, again.calls, again.code]).toEqual([0, calls, 0])
  })
})

describe('site:affected', () => {
  it.for([[], ['tests/tools/check.test.ts', '--bail', '1']])(
    'runs the suite with --changed origin/main and the arguments %j',
    async (args, { repo }) =>
      expect((await repo.run('site/affected', args)).calls)
        .toEqual([['run', '--skip-deps', 'site:test', '--changed', 'origin/main', ...args]])
  )
})

describe('crate:affected', () => {
  it.for<[string, Change, boolean]>([
    ['a commit under rust/', committed('rust/src/lib.rs'), true],
    ['an uncommitted edit under rust/', edit('rust/src/lib.rs'), true],
    ['an untracked file under rust/', edit('rust/src/added.rs'), true],
    ['an edit to the records', edit(RECORDS), true],
    ['an edit to the known answers', edit(ANSWERS), true],
    ['no change', edit(), false],
    ['an edit and an untracked file outside rust/ and the fixtures', edit('README.md', 'docs/new.md'), false],
    ['an edit to another fixture', edit(PHOTON), false],
    ['a commit under rust/ that only origin/main holds', advanced('rust/src/lib.rs'), false]
  ])('runs the crate tests or prints its skip line given %s', async ([, change, runs], { repo }) => {
    await change(repo)
    const run = await repo.run('crate/affected')
    expect([run.calls, run.stdout])
      .toEqual(runs ? [[['run', 'crate:test']], ''] : [[], expect.stringMatching(SKIPPED)])
  })
})
