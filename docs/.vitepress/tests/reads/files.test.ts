import { join } from 'node:path'

import { afterEach, describe, expect, vi } from 'vitest'

import { CHECKS, ROOT }       from '../common/reads.ts'
import { PAGE, PAGES, it }    from '../common/selections.ts'

const GH   = join(ROOT, 'docs/.vitepress/tests/common/bin/gh')
const SYNC = join(ROOT, 'docs/.vitepress/tests/tools/sync.test.ts')

const gitConfig = () =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('GIT_CONFIG_')))

describe('the reads plugin', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('lists the changes with rename detection off, after any git config already set', async ({
    selectedAfter
  }) => {
    const seen: Record<string, string | undefined>[] = []
    Object.entries({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.quotePath', GIT_CONFIG_VALUE_0: 'false' })
      .forEach(([key, value]) => vi.stubEnv(key, value))
    const before = gitConfig()
    const findChangedFiles = async () => {
      await Promise.resolve()
      seen.push(gitConfig())
      return []
    }
    await selectedAfter(findChangedFiles)
    expect(seen).toEqual([{
      ...before,
      GIT_CONFIG_COUNT   : '2',
      GIT_CONFIG_KEY_1   : 'diff.renames',
      GIT_CONFIG_VALUE_1 : 'false'
    }])
    expect(gitConfig()).toEqual(before)
  })

  it('selects the tests reading a changed file they never import', { tags: ['slow'] }, async ({ selected }) =>
    expect(await selected({ related: [GH] })).toEqual([CHECKS, SYNC]))

  it(
    'selects the tests reading a deleted file and the checks of READS, beside the changed files',
    { tags: ['slow'] },
    async ({ selectedAfter }) => {
      expect(await selectedAfter(async () => [GH, PAGE])).toEqual([...PAGES, CHECKS, SYNC].sort())
    }
  )
})
