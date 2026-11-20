import { cp, mkdtempDisposable } from 'node:fs/promises'
import { tmpdir }                from 'node:os'
import { join }                  from 'node:path'

import { $ }                         from 'bun'
import { beforeAll, describe, test } from 'vitest'

import { type Env, STAND_IN_PATH, type TaskRun, linesOf, runTask } from '../common/tasks.ts'

type Change = (repo: Repo) => Promise<unknown>
type Pinned = keyof typeof PINNED
type Task   = 'crate/affected' | 'site/affected' | 'site/check' | 'site/typecheck'

const ANSWERS = 'docs/.vitepress/tests/fixtures/answers.json'
const CHECKED = [
  'run', 'site:lint', ':::', 'site:typecheck', ':::', 'site:affected', ':::', 'crate:affected'
]
const CONFIG  = '.mise/config.toml'
const LOCK    = '.mise/mise.lock'
const PHOTON  = 'docs/.vitepress/tests/fixtures/photon.json'
const RECORDS = 'docs/.vitepress/tests/fixtures/records.json'
const SKIPPED = /^crate:affected found no change since origin\/main\b/
const TYPED   = [
  ['run', '--bun', 'vue-tsc', '--noEmit', '--project', '.vitepress'],
  ['run', '--bun', 'tsc', '--noEmit', '--project', '.vitepress/catalog']
]
const PINNED  = {
  [CONFIG] : '[tools]\nbun = "1.3.2"\nrust = "1.91.0"\n',
  [LOCK]   : '[[tools.bun]]\nversion = "1.3.2"\n\n[[tools.rust]]\nversion = "1.91.0"\n\n'
           + '[tools.rust.options]\ncomponents = "clippy"\n'
}
const SEEDED  = {
  '.gitignore'      : '.cache/\nrust/pkg/\n',
  'README.md'       : 'Upstairs\n',
  [ANSWERS]         : '{}\n',
  [PHOTON]          : '{}\n',
  [RECORDS]         : '[]\n',
  'rust/src/lib.rs' : '\n'
}

/**
 * A scratch repository holding `SEEDED` in one commit on `main`, which
 * `origin/main` names, where each task runs against the stand-ins for `mise`
 * and `bun`.
 */
class Repo {
  private readonly env  : Env
  private readonly root : string

  constructor(dir: string) {
    this.root = join(dir, 'repository')
    this.env  = {
      GIT_CONFIG_NOSYSTEM : '1',
      HOME                : dir,
      PATH                : STAND_IN_PATH,
      STAND_IN_CALLS      : join(dir, 'calls')
    }
  }

  /**
   * A copy in `dir` of the repository `seed` holds.
   */
  static async copied(seed: Repo, dir: string): Promise<Repo> {
    const repo = new Repo(dir)
    await cp(seed.root, repo.root, { recursive: true })
    return repo
  }

  static async seeded(dir: string): Promise<Repo> {
    const repo = new Repo(dir)
    await Promise.all(Object.entries(SEEDED).map(([path, text]) => repo.write(path, text)))
    await repo.git('init', '--initial-branch=main', '--quiet')
    await repo.commit()
    await repo.publish()
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
   * Moves `origin/main` to `HEAD`, as a push to `main` would.
   */
  publish(): Promise<string> {
    return this.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  }

  /**
   * Runs the task at `.mise/tasks/<task>` of the worktree from the root of the
   * repository, each call it makes to `mise` or `bun` exiting with the next
   * status in `exit`, the last repeating once the list runs out, save that a
   * `mise config get --file` call takes its place in that order but exits zero
   * only where the file holds the entry it names.
   */
  run(task: Task, args: string[] = [], exit: number | number[] = 0): Promise<TaskRun> {
    return runTask(task, this.root, this.env, args, exit)
  }

  write(path: string, text: string): Promise<number> {
    return Bun.write(join(this.root, path), text)
  }
}

let seed: Repo

beforeAll(async () => {
  const scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-check-'))
  seed          = await Repo.seeded(scratch.path)
  return () => scratch.remove()
})

const it = test.extend('repo', async ({ onTestFinished }) => {
  const scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-check-'))
  onTestFinished(() => scratch.remove())
  return Repo.copied(seed, scratch.path)
})

/**
 * Commits `change` on a branch of its own, moves `origin/main` to that commit,
 * and switches back to `main`, so the change sits on `origin/main` alone.
 */
const advanced = (change: Change): Change => async repo => {
  await repo.git('switch', '--create', 'advanced', '--quiet')
  await committed(change)(repo)
  await repo.publish()
  await repo.git('switch', 'main', '--quiet')
}

const committed = (change: Change): Change => async repo => {
  await change(repo)
  await repo.commit()
}

const edit = (...paths: string[]): Change => repo =>
  Promise.all(paths.map(path => repo.write(path, 'edited\n')))

/**
 * Commits the `PINNED` text of each of `paths`, moves `origin/main` to that
 * commit, and makes `change` over it, so the commit is the merge base.
 */
const pinned = (change: Change, paths: Pinned[] = [CONFIG, LOCK]): Change => async repo => {
  await Promise.all(paths.map(path => repo.write(path, PINNED[path])))
  await repo.commit()
  await repo.publish()
  await change(repo)
}

const removed = (path: Pinned): Change => repo => repo.git('rm', '--quiet', path)

/**
 * Writes the `PINNED` text of `path` with `from` replaced by `to`, or as
 * `PINNED` holds it where neither is given.
 */
const rewritten = (path: Pinned, from = '', to = ''): Change => repo =>
  repo.write(path, PINNED[path].replace(from, to))

const staged = (path: string): Change => async repo => {
  await edit(path)(repo)
  await repo.git('add', path)
}

describe.concurrent('runTask', () => {
  it('refuses a task file the running test declares no read of in READS', ({ expect }) =>
    expect(runTask('site/serve', tmpdir(), { STAND_IN_CALLS: join(tmpdir(), 'calls') }))
      .rejects.toThrow('check.test.ts runs .mise/tasks/site/serve, which READS gives it no glob for'))
})

describe.concurrent('site:check', () => {
  it(
    'calls site:lint, site:typecheck, site:affected, and crate:affected in one mise run',
    async ({ expect, repo }) => expect((await repo.run('site/check')).calls).toEqual([CHECKED])
  )

  it.for<[string, Change, string]>([
    ['an edit', edit('README.md'), 'README.md'],
    ['a new file', edit('docs/new.md'), 'docs/new.md'],
    ['a staged change', staged('rust/src/lib.rs'), 'rust/src/lib.rs']
  ])(
    'records the tree holding %s, leaving the index as it found it',
    async ([, change, path], { expect, repo }) => {
      await change(repo)
      const index = await repo.index()
      await repo.run('site/check')
      const [tree] = await repo.passed()
      expect([await repo.git('show', `${tree}:${path}`), await repo.index()]).toEqual(['edited\n', index])
    }
  )

  it('records nothing for a run whose tasks fail, exiting with their status', async ({ expect, repo }) => {
    const run = await repo.run('site/check', [], 3)
    expect([run.code, await repo.passed()]).toEqual([3, []])
  })

  it.for<[string, Change, string[][]]>([
    ['calls no task over the tree a passing run recorded', edit(), []],
    ['calls every task again once an edit leaves that tree', edit('README.md'), [CHECKED]]
  ])('%s', async ([, change, calls], { expect, repo }) => {
    const passing = await repo.run('site/check')
    await change(repo)
    const again = await repo.run('site/check')
    expect([passing.code, again.calls, again.code]).toEqual([0, calls, 0])
  })
})

describe.concurrent('site:affected', () => {
  it.for<[string, string[]]>([
    ['no further arguments', []],
    ['a case file and --bail 1', ['tests/tools/check.test.ts', '--bail', '1']]
  ])(
    'runs the suite with --changed origin/main given %s',
    async ([, args], { expect, repo }) =>
      expect((await repo.run('site/affected', args)).calls)
        .toEqual([['run', '--skip-deps', 'site:test', '--changed', 'origin/main', ...args]])
  )
})

describe.concurrent('crate:affected', () => {
  it.for<[string, Change, boolean]>([
    ['a commit under rust/', committed(edit('rust/src/lib.rs')), true],
    ['an uncommitted edit under rust/', edit('rust/src/lib.rs'), true],
    ['an untracked file under rust/', edit('rust/src/added.rs'), true],
    ['an edit to the records', edit(RECORDS), true],
    ['an edit to the known answers', edit(ANSWERS), true],
    ['no change', edit(), false],
    ['an edit and an untracked file outside rust/ and the fixtures', edit('README.md', 'docs/new.md'), false],
    ['an edit to another fixture', edit(PHOTON), false],
    ['a build of the crate under the ignored rust/pkg/', edit('rust/pkg/orbit.js'), false],
    ['a commit under rust/ that only origin/main holds', advanced(edit('rust/src/lib.rs')), false],
    ['a moved rust pin in the config', pinned(rewritten(CONFIG, '1.91.0', '1.92.0')), true],
    ['a moved [[tools.rust]] table', pinned(rewritten(LOCK, '1.91.0', '1.92.0')), true],
    ['a moved [tools.rust.options] table', pinned(rewritten(LOCK, 'clippy', 'rustfmt')), true],
    ['a config the merge base lacks', pinned(rewritten(CONFIG), [LOCK]), true],
    ['a config the branch removes', pinned(removed(CONFIG)), true],
    ['a lockfile the merge base lacks', pinned(rewritten(LOCK), [CONFIG]), true],
    ['a lockfile the branch removes', pinned(removed(LOCK)), true],
    ['a realigned rust line', pinned(rewritten(CONFIG, 'rust =', 'rust    =')), false],
    ['a moved bun pin in the config', pinned(rewritten(CONFIG, '1.3.2', '1.3.3')), false],
    ['a moved [[tools.bun]] table', pinned(rewritten(LOCK, '1.3.2', '1.3.3')), false],
    [
      'a [[tools.rust-analyzer]] table in place of [[tools.bun]]',
      pinned(rewritten(LOCK, 'bun', 'rust-analyzer')),
      false
    ],
    [
      'a toolchain move that only origin/main holds',
      pinned(advanced(rewritten(CONFIG, '1.91.0', '1.92.0'))),
      false
    ]
  ])('runs the crate tests or prints its skip line given %s', async ([, change, runs], { expect, repo }) => {
    await change(repo)
    const run = await repo.run('crate/affected')
    expect([run.calls.filter(([command]) => command === 'run'), run.stdout])
      .toEqual(runs ? [[['run', 'crate:test']], ''] : [[], expect.stringMatching(SKIPPED)])
  })
})

describe.concurrent('site:typecheck', () => {
  it.for<[number, number, number]>([
    [0, 0, 0],
    [2, 2, 0],
    [2, 0, 2],
    [1, 2, 1]
  ])(
    'runs tsc on the catalog service after vue-tsc on the site, exiting %i where they exit %i and %i',
    async ([code, ...exits], { expect, repo }) =>
      expect(await repo.run('site/typecheck', [], exits)).toMatchObject({ calls: TYPED, code })
  )
})
