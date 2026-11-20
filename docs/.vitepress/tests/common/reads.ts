import { globSync }                    from 'node:fs'
import { join, matchesGlob, relative } from 'node:path'

/**
 * Each module of the suite or the site, by its path from `ROOT`, mapped to
 * the globs, from `ROOT`, of the files it reads or runs without importing
 * them, which `vitest.config.ts` adds to the module's graph as watched files.
 */
export const READS: Record<string, string[]> = {
  'docs/.vitepress/lib/site/markdown.ts'              : ['docs/.vitepress/lib/site/references.bib'],
  'docs/.vitepress/lib/site/provenance.data.ts'       : ['rust/Cargo.lock'],
  'docs/.vitepress/tests/catalog/login.test.ts'       : ['docs/.vitepress/catalog/login.ts'],
  'docs/.vitepress/tests/catalog/request.test.ts'     : ['docs/.vitepress/catalog/request.ts'],
  'docs/.vitepress/tests/common/drawings.ts'          : ['rust/pkg/orbit_bg.wasm'],
  'docs/.vitepress/tests/common/shipped.ts'           : ['.github/README.md', 'docs/public/**'],
  'docs/.vitepress/tests/common/tasks.ts'             : ['docs/.vitepress/tests/common/check/*'],
  'docs/.vitepress/tests/config.test.ts'              : ['docs/data/index.md', 'docs/public/_headers'],
  'docs/.vitepress/tests/lib/map/credit.test.ts'      : ['docs/data/index.md'],
  'docs/.vitepress/tests/lib/orbit/worker.test.ts'    : ['rust/pkg/orbit_bg.wasm'],
  'docs/.vitepress/tests/lib/site/cards.test.ts'      : ['docs/index.md', 'docs/*/index.md'],
  'docs/.vitepress/tests/lib/site/mark.test.ts'       : ['docs/public/{favicon,wordmark-*}.svg'],
  'docs/.vitepress/tests/lib/site/markdown.test.ts'   : ['docs/*.md', 'docs/*/*.md'],
  'docs/.vitepress/tests/lib/site/provenance.test.ts' : ['rust/Cargo.lock'],
  'docs/.vitepress/tests/lib/site/seals.test.ts'      : ['docs/public/seals/*.svg'],
  'docs/.vitepress/tests/lib/site/sections.test.ts'   : ['docs/*/index.md'],
  'docs/.vitepress/tests/lib/site/start.test.ts'      : ['docs/public/start/*.svg'],
  'docs/.vitepress/tests/theme/Credits.test.ts'       : ['docs/data/index.md'],
  'docs/.vitepress/tests/theme/NotFound.test.ts'      : ['docs/.vitepress/theme/credit.css'],
  'docs/.vitepress/tests/theme/style.test.ts'         : ['docs/.vitepress/theme/style.css'],
  'docs/.vitepress/tests/tools/audit.test.ts'         : ['.mise/tasks/lock/audit'],
  'docs/.vitepress/tests/tools/logbook.test.ts'       : ['.github/scripts/summaries/deploy.md'],
  'docs/.vitepress/tests/tools/reel.test.ts'          : ['.github/reel-*.gif'],
  'docs/.vitepress/tests/tools/served.test.ts'        : ['docs/.vitepress/tests/fixtures/catalog.bin'],
  'docs/.vitepress/tests/tools/sync.test.ts'          : ['docs/.vitepress/tests/fixtures/settings.toml'],

  'docs/.vitepress/lib/site/faces.ts': [
    'docs/node_modules/@fontsource*/*/files/*-latin-*-normal.woff2'
  ],

  'docs/.vitepress/lib/site/licenses.ts': [
    'docs/node_modules/{katex,maplibre-gl}/*', 'rust/Cargo.toml'
  ],

  'docs/.vitepress/tests/common/gh.ts': [
    '.github/**', '.mise/tasks/repo/ci.toml', 'docs/.vitepress/tests/common/bin/gh',
    'docs/.vitepress/tests/fixtures/settings.toml', 'docs/.vitepress/tools/sync.ts', 'docs/package.json'
  ],

  'docs/.vitepress/tests/lib/orbit/catalog.test.ts': [
    'docs/.vitepress/tests/fixtures/catalog.bin', 'rust/pkg/orbit_bg.wasm'
  ],

  'docs/.vitepress/tests/lib/site/licenses.test.ts': [
    'docs/.vitepress/tests/fixtures/notices*.txt', 'docs/node_modules/katex/{LICENSE,package.json}',
    'docs/node_modules/maplibre-gl/LICENSE.txt'
  ],

  'docs/.vitepress/tests/lib/site/sheets.test.ts': [
    'docs/node_modules/katex/dist/{katex.min.css,fonts/*}',
    'docs/node_modules/maplibre-gl/dist/maplibre-gl.css'
  ],

  'docs/.vitepress/tests/tools/check.test.ts': [
    '.mise/tasks/crate/affected', '.mise/tasks/site/{affected,check,typecheck}'
  ],

  'docs/.vitepress/tools/repository.ts': [
    '.github/{CONTRIBUTING.md,labels.toml,release.yml}',
    '.github/{ISSUE_TEMPLATE,actions,rulesets,workflows}/**', '.mise/tasks/**',
    'docs/package.json'
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
 * Reports whether the module at `module`, an absolute path, may read `file`, a
 * path from `ROOT`, meaning `readersOfGone` lists the module for the file.
 */
export const declares = (file: string, module: string, reads = READS): boolean =>
  readersOfGone([join(ROOT, file)], reads).includes(module)

/**
 * Maps each module in `reads`, by its absolute path, to the absolute paths of
 * the files its globs match, which a deleted file leaves empty.
 */
export const watchedOf = (reads = READS): Map<string, string[]> =>
  new Map(Object.entries(reads).map(([module, globs]) =>
    [join(ROOT, module), globSync(globs, { cwd: ROOT }).map(file => join(ROOT, file))]))
