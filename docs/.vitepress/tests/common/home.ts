import { mkdtempDisposable } from 'node:fs/promises'
import { tmpdir }            from 'node:os'
import { join }              from 'node:path'

import { test } from 'vitest'

/**
 * Runs a case with `home`, a scratch folder standing in for the home folder
 * and removed once the case finishes.
 */
export const it = test.extend('home', async ({ onTestFinished }) => {
  const scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-home-'))
  onTestFinished(() => scratch.remove())
  return scratch.path
})

/**
 * Returns `line` with the path of a `.netrc` file written as `~/.netrc`.
 */
export const tilded = (line: string) => line.replace(/\/\S*\/\.netrc/, '~/.netrc')
