import { existsSync, globSync }        from 'node:fs'
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
 * Reports whether the test at `test`, an absolute path, declares in `reads` a
 * glob matching `file`, a path from `ROOT`.
 */
export const declares = (file: string, test: string, reads = READS): boolean =>
  !!reads[relative(ROOT, test)]?.some(glob => matchesGlob(file, glob))

/**
 * Maps each module in `reads`, by its absolute path, to the absolute paths of
 * the files its globs match, throwing where a module is missing or a glob
 * matches no file.
 */
export const watchedOf = (reads = READS): Map<string, string[]> =>
  new Map(Object.entries(reads).map(([module, globs]) => {
    const path = join(ROOT, module)
    if (!existsSync(path)) throw new Error(`READS names ${module}, which is missing`)
    return [path, globs.flatMap(glob => {
      const files = globSync(glob, { cwd: ROOT }).map(file => join(ROOT, file))
      if (!files.length) throw new Error(`READS gives ${module} the glob ${glob}, which matches no file`)
      return files
    })]
  }))
