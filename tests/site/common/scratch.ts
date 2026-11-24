import { mkdtempDisposable } from 'node:fs/promises'
import { tmpdir }            from 'node:os'
import { join }              from 'node:path'

import { test } from 'vitest'

/**
 * Runs a case with `scratch`, a folder of its own under the temporary folder,
 * removed once the case finishes.
 */
export const it = test.extend('scratch', async ({ onTestFinished }) => {
  const scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-scratch-'))
  onTestFinished(() => scratch.remove())
  return scratch.path
})

/**
 * Returns `line` with the path of a `.netrc` file written as `~/.netrc`.
 */
export const tilded = (line: string) => line.replace(/\/\S*\/\.netrc/, '~/.netrc')
