import { mkdtempDisposable } from 'node:fs/promises'
import { tmpdir }            from 'node:os'
import { join, relative }    from 'node:path'

import { $ }                               from 'bun'
import { afterEach, describe, expect, vi } from 'vitest'

import { CHECKS, ROOT, TABLE } from '../common/reads.ts'
import TABLE_TEXT              from '../common/reads.ts?raw'
import { it }                  from '../common/selections.ts'

const DRAWN = join(ROOT, 'docs/.vitepress/tests/lib/state/drawings.test.ts')
const LOOKS = join(ROOT, 'docs/.vitepress/tests/lib/orbit/looks.test.ts')

/**
 * The text of `reads.ts` with an empty `READS` entry for `test`, an absolute
 * path, ahead of every other entry.
 */
const adding = (test: string) => TABLE_TEXT.replace('= {\n', `= {\n  '${relative(ROOT, test)}': [],\n`)

/**
 * Makes a scratch repository on `main`, which `GIT_DIR` names until the case
 * ends, returning a function running git in it and one committing `text` as
 * `reads.ts`, and removing the repository once disposed.
 */
const scratchRepo = async () => {
  const scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-reads-git-'))
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

describe('the reads plugin', () => {
  afterEach(() => vi.unstubAllEnvs())

  it(
    'selects the tests loading a module whose READS entry an edit changes, beside the checks of READS',
    { tags: ['slow'] },
    async ({ selectedAfter }) => {
      await using repo = await scratchRepo()
      await repo.commit(adding(LOOKS))
      expect(await selectedAfter(async () => [TABLE])).toEqual([CHECKS, LOOKS].sort())
    }
  )

  it(
    'compares READS against its merge base with the branch --changed names',
    { tags: ['slow'] },
    async ({ selectedAfter }) => {
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
