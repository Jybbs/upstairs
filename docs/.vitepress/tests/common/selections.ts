import { mkdtempDisposable } from 'node:fs/promises'
import { tmpdir }            from 'node:os'
import { join }              from 'node:path'

import { test }                          from 'vitest'
import { type CliOptions, createVitest } from 'vitest/node'

import { ROOT } from './reads.ts'

/**
 * A page missing from the tree, and the tests whose `READS` globs match it,
 * by their absolute paths.
 */
export const PAGE  = join(ROOT, 'docs/gone/index.md')
export const PAGES = ['cards', 'markdown', 'sections']
  .map(name => join(ROOT, `docs/.vitepress/tests/lib/site/${name}.test.ts`))

/**
 * Runs a case with `suite`, the options every selection of the suite takes,
 * `selected`, which lists by absolute path the tests a run of the suite under
 * `options` selects, and `selectedAfter`, which lists those a run under
 * `--changed` reaches, given `changed` as its ref or `true` for the working
 * tree, where git lists the files `findChangedFiles` returns. Every case of a
 * file shares one module cache, removed once the file ends.
 */
export const it = test
  .extend('suite', { scope: 'file' }, {
    config : join(ROOT, 'docs/.vitepress/tests/vitest.config.ts'),
    root   : join(ROOT, 'docs'),
    watch  : false
  } satisfies CliOptions)
  .extend('selected', { scope: 'file' }, async ({ suite }, { onCleanup }) => {
    const cache = await mkdtempDisposable(join(tmpdir(), 'upstairs-reads-'))
    onCleanup(() => cache.remove())
    return async (options: CliOptions) => {
      const vitest = await createVitest({ ...suite, fsModuleCachePath: cache.path, ...options })
      try {
        return (await vitest.getRelevantTestSpecifications()).map(spec => spec.moduleId).sort()
      } finally {
        await vitest.close()
      }
    }
  })
  .extend('selectedAfter', { scope: 'file' }, ({ selected }) =>
    (findChangedFiles: () => Promise<string[]>, changed: string | true = true) =>
      selected({ changed, experimental: { vcsProvider: { findChangedFiles } } }))
