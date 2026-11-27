import { cp, mkdir, utimes, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join }     from 'node:path'

import { $ }        from 'bun'
import { describe } from 'vitest'

import { ROOT }                   from '../common/reads.ts'
import { it as scratched }        from '../common/scratch.ts'
import { STAND_IN_PATH, callsIn } from '../common/tasks.ts'

const CHECKS   = [
  'catalog:bundle', 'crate:lint', 'crate:test', 'lock:audit', 'lock:check', 'repo:audit', 'repo:lint',
  'site:coverage', 'site:cruft', 'site:links', 'site:lint', 'site:press', 'site:typecheck'
]
const COMPILE  = '.mise/tasks/crate/compile'
const FAILED   = '.mise/tasks/gha/failed'
const MISE     = Bun.which('mise')!
const SOURCES  = ['rust/Cargo.lock', 'rust/Cargo.toml', 'rust/src/lib.rs']

/**
 * A project in a scratch folder holding the repository's mise config and the
 * task files a case names, run through the real `mise` where the stand-ins
 * answer `cargo` and `wasm-bindgen`.
 */
class Project {
  private constructor(readonly root: string) {}

  static async laid(root: string, tasks: string[] = []): Promise<Project> {
    await mkdir(join(root, '.mise/tasks/crate'), { recursive: true })
    await mkdir(join(root, '.mise/tasks/repo'), { recursive: true })
    await mkdir(join(root, 'rust/src'), { recursive: true })
    await Promise.all(['.mise/config.toml', ...tasks].map(file => cp(join(ROOT, file), join(root, file))))
    await Promise.all(['.mise/mise.lock', ...SOURCES].map(file => writeFile(join(root, file), '')))
    return new Project(root)
  }

  calls(): Promise<string[][]> {
    return callsIn(join(this.root, 'calls'))
  }

  /**
   * Replaces the text of `file`, or moves its modified time a minute past now
   * where `text` is left out.
   */
  async change(file: string, text?: string): Promise<void> {
    const later = Date.now() / 1000 + 60
    if (text === undefined) await utimes(join(this.root, file), later, later)
    else await writeFile(join(this.root, file), text)
  }

  async run(...args: string[]): Promise<{ code: number, stdout: string }> {
    const result = await $`${MISE} ${args.includes('doctor') ? [] : ['run']} ${args}`
      .cwd(this.root)
      .env({
        HOME                      : this.root,
        MISE_TRUSTED_CONFIG_PATHS : this.root,
        PATH                      : [dirname(MISE), STAND_IN_PATH].join(delimiter),
        STAND_IN_CALLS            : join(this.root, 'calls'),
        STAND_IN_EXIT             : '0'
      })
      .nothrow()
      .quiet()
    return { code: result.exitCode, stdout: result.stdout.toString() }
  }
}

const it = scratched.extend('project', ({ scratch }) => Project.laid(scratch, [COMPILE]))

describe.concurrent('crate:compile', () => {
  it('builds the crate once, then skips while its sources hold their contents', async ({ expect, project }) => {
    await project.run('crate:compile')
    await Promise.all(SOURCES.map(file => project.change(file)))
    const again = await project.run('crate:compile')
    expect([again.code, (await project.calls()).map(([call]) => call)]).toEqual([0, ['build', 'wasm-bindgen']])
  })

  it.for(SOURCES)('builds again once %s changes in content', async (file, { expect, project }) => {
    await project.run('crate:compile')
    await project.change(file, 'edited\n')
    await project.run('crate:compile')
    expect((await project.calls()).map(([call]) => call)).toEqual(['build', 'wasm-bindgen', 'build', 'wasm-bindgen'])
  })

  it('builds again once the lockfile of the tools changes in content', async ({ expect, project }) => {
    await project.run('crate:compile')
    await project.change('.mise/mise.lock', 'edited\n')
    await project.run('crate:compile')
    expect((await project.calls()).map(([call]) => call)).toEqual(['build', 'wasm-bindgen', 'build', 'wasm-bindgen'])
  })
})

describe.concurrent('repo:ci', () => {
  const stubbed = async ({ scratch }: { scratch: string }) => {
    const project = await Project.laid(scratch, ['.mise/tasks/repo/ci.toml'])
    const tasks   = CHECKS.map(task => `[tasks."${task}"]\nrun = 'echo "$MISE_TASK_NAME" >> calls; ${
      task === 'lock:audit' ? 'exit 3' : 'true'
    }'\n`)
    await writeFile(join(scratch, 'mise.toml'), tasks.join('\n'))
    return project
  }

  const ci = scratched.extend('project', stubbed)

  ci('runs every check after one fails, exiting with its status', async ({ expect, project }) => {
    const { code } = await project.run('repo:ci')
    const ran      = (await Bun.file(join(project.root, 'calls')).text()).split('\n').filter(Boolean)
    expect([code, ran.sort()]).toEqual([3, [...CHECKS].sort()])
  })

  ci('writes a report naming the failed task under the cache folder', async ({ expect, project }) => {
    await project.run('repo:ci')
    const report = await Bun.file(join(project.root, '.cache/ci/report.json')).json() as
      { tasks: { name: string, status: string }[] }
    expect(report.tasks.filter(({ status }) => status === 'failed').map(({ name }) => name))
      .toEqual(['lock:audit'])
  })
})

describe.concurrent('mise doctor project', () => {
  const doctor = scratched.extend('project', async ({ scratch }) => {
    const project = await Project.laid(scratch)
    await $`git init --initial-branch=main --quiet`.cwd(scratch).quiet()
    await $`git -c user.email=a@b.c -c user.name=a commit --allow-empty --message=m --quiet`.cwd(scratch).quiet()
    return project
  })

  const published = (project: Project) => $`git update-ref refs/remotes/origin/main HEAD`.cwd(project.root).quiet()
  const cataloged = async (project: Project) => {
    await mkdir(join(project.root, 'docs/public'), { recursive: true })
    await writeFile(join(project.root, 'docs/public/catalog.bin'), '')
  }

  doctor('passes where origin/main gives a merge base and the catalog is present', async ({ expect, project }) => {
    await Promise.all([published(project), cataloged(project)])
    expect((await project.run('doctor', 'project')).code).toBe(0)
  })

  doctor('fails on a missing catalog, naming it', async ({ expect, project }) => {
    await published(project)
    const { code, stdout } = await project.run('doctor', 'project')
    expect([code, stdout]).toEqual([1, expect.stringContaining('FAIL catalog')])
  })

  doctor('fails on a missing origin/main, naming it', async ({ expect, project }) => {
    await cataloged(project)
    const { code, stdout } = await project.run('doctor', 'project')
    expect([code, stdout]).toEqual([1, expect.stringContaining('FAIL merge-base')])
  })
})

describe.concurrent('gha:failed', () => {
  const REPORT = (statuses: Record<string, string>) => JSON.stringify({
    status : 'failed',
    tasks  : Object.entries(statuses).map(([name, status]) => ({ args: [], name, status }))
  }, null, 2)

  it.for<[string, Record<string, string>, string]>([
    ['one failed task', { 'crate:compile': 'passed', 'repo:audit': 'failed' }, 'repo:audit\n'],
    ['two failed tasks', { 'lock:audit': 'failed', 'repo:audit': 'failed' }, 'lock:audit, repo:audit\n'],
    ['no failed task', { 'repo:audit': 'passed', 'site:install': 'cached' }, '\n']
  ])('prints the tasks of a report holding %s', async ([, statuses, printed], { expect, scratch }) => {
    const report = join(scratch, 'report.json')
    await writeFile(report, REPORT(statuses))
    expect(await $`${join(ROOT, FAILED)}`.env({ REPORT: report }).text()).toBe(printed)
  })
})
