import { globSync }                    from 'node:fs'
import { join, matchesGlob, relative } from 'node:path'

/**
 * Each module of the suite or the site, by its path from `ROOT`, mapped to
 * the globs, from `ROOT`, of the files it reads or runs without importing
 * them, which `vitest.config.ts` adds to the module's graph as watched files.
 */
export const READS: Record<string, string[]> = {
  'docs/.vitepress/lib/site/markdown.ts'              : ['docs/.vitepress/lib/site/references.bib'],
  'docs/.vitepress/tests/common/shipped.ts'           : ['.github/README.md', 'docs/public/**'],
  'docs/.vitepress/tests/common/tasks.ts'             : ['docs/.vitepress/tests/common/check/*'],
  'docs/.vitepress/tests/config.test.ts'              : ['docs/data/index.md', 'docs/public/_headers'],
  'docs/.vitepress/tests/lib/map/credit.test.ts'      : ['docs/data/index.md'],
  'docs/.vitepress/tests/lib/orbit/catalog.test.ts'   : ['docs/.vitepress/tests/fixtures/catalog.bin'],
  'docs/.vitepress/tests/lib/site/cards.test.ts'      : ['docs/index.md', 'docs/*/index.md'],
  'docs/.vitepress/tests/lib/site/licenses.test.ts'   : ['docs/.vitepress/tests/fixtures/notices*.txt'],
  'docs/.vitepress/tests/lib/site/markdown.test.ts'   : ['docs/*.md', 'docs/*/*.md'],
  'docs/.vitepress/tests/lib/site/sections.test.ts'   : ['docs/*/index.md'],
  'docs/.vitepress/tests/theme/Credits.test.ts'       : ['docs/data/index.md'],
  'docs/.vitepress/tests/theme/NotFound.test.ts'      : ['docs/.vitepress/theme/credit.css'],
  'docs/.vitepress/tests/theme/style.test.ts'         : ['docs/.vitepress/theme/style.css'],
  'docs/.vitepress/tests/tools/audit.test.ts'         : ['.mise/tasks/lock/audit'],
  'docs/.vitepress/tests/tools/logbook.test.ts'       : ['.github/scripts/summaries/deploy.md'],
  'docs/.vitepress/tests/tools/reel.test.ts'          : ['.github/reel-*.gif'],
  'docs/.vitepress/tests/tools/served.test.ts'        : ['docs/.vitepress/tests/fixtures/catalog.bin'],

  'docs/.vitepress/tests/common/gh.ts': [
    'docs/.vitepress/tests/common/bin/gh', 'docs/.vitepress/tests/fixtures/settings.toml',
    'docs/.vitepress/tools/sync.ts'
  ],

  'docs/.vitepress/tests/tools/check.test.ts': [
    '.mise/tasks/crate/affected', '.mise/tasks/site/{affected,check,typecheck}'
  ],

  'docs/.vitepress/tools/repository.ts': [
    '.github/{CONTRIBUTING.md,labels.toml,release.yml}',
    '.github/{ISSUE_TEMPLATE,actions,rulesets,workflows}/**', '.mise/tasks/**'
  ]
}
/**
 * The root of the worktree the suite runs in.
 */
export const ROOT = join(import.meta.dirname, '../../../..')

/**
 * Lists the absolute path of each module declaring in `reads` a glob matching
 * `file`, an absolute path, which need not exist.
 */
export const readersOf = (file: string, reads = READS): string[] =>
  Object.entries(reads)
    .filter(([, globs]) => globs.some(glob => matchesGlob(relative(ROOT, file), glob)))
    .map(([module]) => join(ROOT, module))

/**
 * Lists the readers of each deleted file in `gone`, absolute paths, and the
 * test checking `reads` against the tree where any is declared in `reads`.
 */
export const readersOfGone = (gone: string[], reads = READS): string[] => {
  const readers = gone.flatMap(file => readersOf(file, reads))
  const stale   = readers.length > 0 || gone.some(file => relative(ROOT, file) in reads)
  return stale ? [...readers, join(ROOT, 'docs/.vitepress/tests/reads.test.ts')] : readers
}

/**
 * Reports whether the test at `test`, an absolute path, declares in `reads` a
 * glob matching `file`, a path from `ROOT`.
 */
export const declares = (file: string, test: string, reads = READS): boolean =>
  readersOf(join(ROOT, file), reads).includes(test)

/**
 * Maps each module in `reads`, by its absolute path, to the absolute paths of
 * the files its globs match, which a deleted file leaves empty.
 */
export const watchedOf = (reads = READS): Map<string, string[]> =>
  new Map(Object.entries(reads).map(([module, globs]) =>
    [join(ROOT, module), globSync(globs, { cwd: ROOT }).map(file => join(ROOT, file))]))
