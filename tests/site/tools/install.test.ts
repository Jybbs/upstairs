import { cp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { join }                              from 'node:path'

import { $ }        from 'bun'
import { describe } from 'vitest'

import { ROOT }                   from '../common/reads.ts'
import { it as scratched }        from '../common/scratch.ts'
import { STAND_IN_PATH, callsIn } from '../common/tasks.ts'

const INSTALL = ['install', '--frozen-lockfile']
const MISE    = Bun.which('mise')!
const TASK    = '.mise/tasks/site/install'

/**
 * A project in a scratch folder holding the `site:install` task file, an empty
 * `package.json`, `bun.lock`, and mise config, and the `node_modules` folder a
 * real install leaves, where `bun` is the stand-in.
 */
class Project {
  private constructor(private readonly root: string) {}

  /**
   * Lays out the project in `root`.
   */
  static async laid(root: string): Promise<Project> {
    await mkdir(join(root, '.mise/tasks/site'), { recursive: true })
    await mkdir(join(root, 'node_modules'))
    await cp(join(ROOT, TASK), join(root, TASK))
    await cp(join(ROOT, '.mise/config.toml'), join(root, '.mise/config.toml'))
    await Promise.all(['bun.lock', 'package.json'].map(file => writeFile(join(root, file), '')))
    return new Project(root)
  }

  /**
   * Each call to `bun` the runs so far made, as its arguments.
   */
  calls(): Promise<string[][]> {
    return callsIn(join(this.root, 'calls'))
  }

  /**
   * Replaces the text of `file`, or moves its modified time a minute past now
   * where `text` is left out.
   */
  change(file: string, text?: string): Promise<void> {
    const later = Date.now() / 1000 + 60
    return text === undefined ? utimes(join(this.root, file), later, later) : writeFile(join(this.root, file), text)
  }

  /**
   * Runs `site:install` through mise, with `bun` exiting with `exit`, and
   * returns the exit status.
   */
  async install(exit = 0): Promise<number> {
    const result = await $`${MISE} run site:install`
      .cwd(this.root)
      .env({
        HOME                      : this.root,
        MISE_TRUSTED_CONFIG_PATHS : this.root,
        PATH                      : STAND_IN_PATH,
        STAND_IN_CALLS            : join(this.root, 'calls'),
        STAND_IN_EXIT             : String(exit)
      })
      .nothrow()
      .quiet()
    return result.exitCode
  }

  /**
   * Removes `node_modules` with the marker inside it, then leaves an empty one
   * in its place, since the stand-in writes no packages the way `bun` does.
   */
  async removePackages(): Promise<void> {
    await rm(join(this.root, 'node_modules'), { recursive: true })
    await mkdir(join(this.root, 'node_modules'))
  }
}

const it = scratched.extend('project', ({ scratch }) => Project.laid(scratch))

describe.concurrent('site:install', () => {
  it('skips a second run over the same package.json and bun.lock', async ({ expect, project }) => {
    expect([await project.install(), await project.install()]).toEqual([0, 0])
    expect(await project.calls()).toEqual([INSTALL])
  })

  it.for(['bun.lock', 'package.json'])(
    'installs again once %s changes',
    async (file, { expect, project }) => {
      await project.install()
      await project.change(file, 'edited\n')
      expect(await project.install()).toBe(0)
      expect(await project.calls()).toEqual([INSTALL, INSTALL])
    })

  it.for(['bun.lock', 'package.json'])(
    'skips the run once %s is rewritten with the contents it had',
    async (file, { expect, project }) => {
      await project.install()
      await project.change(file)
      expect(await project.install()).toBe(0)
      expect(await project.calls()).toEqual([INSTALL])
    })

  it('installs again once the packages are removed', async ({ expect, project }) => {
    await project.install()
    await project.removePackages()
    expect(await project.install()).toBe(0)
    expect(await project.calls()).toEqual([INSTALL, INSTALL])
  })

  it('fails every run while the frozen install fails after bun.lock changes', async ({ expect, project }) => {
    await project.install()
    await project.change('bun.lock', 'edited\n')
    expect([await project.install(1), await project.install(1)]).toEqual([1, 1])
    expect(await project.calls()).toEqual([INSTALL, INSTALL, INSTALL])
  })

  it('skips the run after a failed install passes again', async ({ expect, project }) => {
    await project.install(1)
    expect([await project.install(), await project.install()]).toEqual([0, 0])
    expect(await project.calls()).toEqual([INSTALL, INSTALL])
  })
})
