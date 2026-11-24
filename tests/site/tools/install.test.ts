import { cp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { join }                              from 'node:path'

import { $ }        from 'bun'
import { describe } from 'vitest'

import { ROOT }                   from '../common/reads.ts'
import { it }                     from '../common/scratch.ts'
import { STAND_IN_PATH, linesOf } from '../common/tasks.ts'

const INSTALL = ['install', '--frozen-lockfile']
const MISE    = Bun.which('mise')!
const TASK    = '.mise/tasks/site/install'

/**
 * Lays out a project in `dir` holding the `site:install` task file, an empty
 * `package.json`, `bun.lock`, and mise config, and the `node_modules` folder a
 * real install leaves.
 */
async function project(dir: string) {
  await mkdir(join(dir, '.mise/tasks/site'), { recursive: true })
  await mkdir(join(dir, 'node_modules'))
  await cp(join(ROOT, TASK), join(dir, TASK))
  await Promise.all(['.mise/config.toml', 'bun.lock', 'package.json'].map(file => writeFile(join(dir, file), '')))
}

/**
 * Runs `site:install` through mise from `dir`, with `bun` the stand-in exiting
 * with `exit`, and returns the exit status.
 */
const install = async (dir: string, exit = 0) => (
  await $`${MISE} run site:install`
    .cwd(dir)
    .env({
      HOME                      : dir,
      MISE_TRUSTED_CONFIG_PATHS : dir,
      PATH                      : STAND_IN_PATH,
      STAND_IN_CALLS            : join(dir, 'calls'),
      STAND_IN_EXIT             : String(exit)
    })
    .nothrow()
    .quiet()
).exitCode

/**
 * Each call to `bun` the runs from `dir` made, as its arguments.
 */
const calls = async (dir: string) =>
  linesOf(await Bun.file(join(dir, 'calls')).text()).map(call => call.split('\t'))

describe.concurrent('site:install', () => {
  it('skips a second run over the same package.json and bun.lock', async ({ expect, scratch }) => {
    await project(scratch)
    expect([await install(scratch), await install(scratch)]).toEqual([0, 0])
    expect(await calls(scratch)).toEqual([INSTALL])
  })

  it.for(['bun.lock', 'package.json'])('installs again once %s changes', async (file, { expect, scratch }) => {
    await project(scratch)
    await install(scratch)
    const later = Date.now() / 1000 + 60
    await utimes(join(scratch, file), later, later)
    expect(await install(scratch)).toBe(0)
    expect(await calls(scratch)).toEqual([INSTALL, INSTALL])
  })

  it('installs again once the packages are removed', async ({ expect, scratch }) => {
    await project(scratch)
    await install(scratch)
    await rm(join(scratch, 'node_modules'), { recursive: true })
    await mkdir(join(scratch, 'node_modules'))
    expect(await install(scratch)).toBe(0)
    expect(await calls(scratch)).toEqual([INSTALL, INSTALL])
  })

  it('fails every run while the frozen install fails', async ({ expect, scratch }) => {
    await project(scratch)
    expect([await install(scratch, 1), await install(scratch, 1)]).toEqual([1, 1])
    expect(await calls(scratch)).toEqual([INSTALL, INSTALL])
  })
})
