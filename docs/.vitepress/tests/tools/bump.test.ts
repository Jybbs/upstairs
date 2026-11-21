import { mkdtempDisposable } from 'node:fs/promises'
import { tmpdir }            from 'node:os'
import { join }              from 'node:path'

import { describe, test } from 'vitest'

import { runTask } from '../common/tasks.ts'

const it = test.extend('scratch', async ({ onTestFinished }) => {
  const scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-bump-'))
  onTestFinished(() => scratch.remove())
  return scratch.path
})

/**
 * Runs `repo:bump` from `dir` with each flag in `flags` set as mise's usage
 * sets a passed flag.
 */
const run = (dir: string, flags: string[]) => runTask('repo/bump', dir, {
  STAND_IN_CALLS: join(dir, 'calls'),
  ...Object.fromEntries(flags.map(flag => [`usage_${flag}`, 'true']))
})

describe.concurrent('repo:bump', () => {
  it.for([
    ['minor', []],
    ['patch', ['patch']],
    ['major', ['major']]
  ] as const)('moves the version to the next %s release', async ([increment, flags], { expect, scratch }) =>
    expect(await run(scratch, [...flags])).toMatchObject({
      calls : [['pm', 'version', '--no-git-tag-version', increment]],
      code  : 0
    }))

  it('refuses --major and --patch together, moving nothing', async ({ expect, scratch }) =>
    expect(await run(scratch, ['major', 'patch'])).toMatchObject({
      calls  : [],
      code   : 1,
      stderr : 'Pass --major or --patch, not both\n'
    }))
})
