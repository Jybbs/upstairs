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
  'docs/.vitepress/tests/common/shipped.ts'           : ['.github/README.md'],
  'docs/.vitepress/tests/common/tasks.ts'             : ['docs/.vitepress/tests/common/check/*'],
  'docs/.vitepress/tests/config.test.ts'              : ['docs/data/index.md', 'docs/public/_headers'],
  'docs/.vitepress/tests/lib/map/credit.test.ts'      : ['docs/data/index.md'],
  'docs/.vitepress/tests/lib/orbit/worker.test.ts'    : ['rust/pkg/orbit_bg.wasm'],
  'docs/.vitepress/tests/lib/site/cards.test.ts'      : ['docs/index.md', 'docs/*/index.md'],
  'docs/.vitepress/tests/lib/site/guide.test.ts'      : ['docs/guide/index.md'],
  'docs/.vitepress/tests/lib/site/mark.test.ts'       : ['docs/public/{favicon,wordmark-*}.svg'],
  'docs/.vitepress/tests/lib/site/markdown.test.ts'   : ['docs/*.md', 'docs/*/*.md'],
  'docs/.vitepress/tests/lib/site/provenance.test.ts' : ['rust/Cargo.lock'],
  'docs/.vitepress/tests/lib/site/seals.test.ts'      : ['docs/public/seals/*.svg'],
  'docs/.vitepress/tests/lib/site/sections.test.ts'   : ['docs/*/index.md'],
  'docs/.vitepress/tests/lib/site/start.test.ts'      : ['docs/public/start/*.svg'],
  'docs/.vitepress/tests/theme/Credits.test.ts'       : ['docs/data/index.md'],
  'docs/.vitepress/tests/theme/GuideFigures.test.ts'  : ['docs/.vitepress/theme/guide.css'],
  'docs/.vitepress/tests/theme/NotFound.test.ts'      : ['docs/.vitepress/theme/credit.css'],
  'docs/.vitepress/tests/theme/style.test.ts'         : ['docs/.vitepress/theme/style.css'],
  'docs/.vitepress/tests/tools/audit.test.ts'         : ['.mise/tasks/lock/audit'],
  'docs/.vitepress/tests/tools/bump.test.ts'          : ['.mise/tasks/repo/bump'],
  'docs/.vitepress/tests/tools/lockfile.test.ts'      : ['docs/.vitepress/tools/lockfile.ts'],
  'docs/.vitepress/tests/tools/logbook.test.ts'       : ['.github/scripts/summaries/deploy.md'],
  'docs/.vitepress/tests/tools/prune.test.ts'         : ['.mise/tasks/gha/prune'],
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
    '.github/{CONTRIBUTING.md,labels.toml,release.yml,settings.toml}',
    '.github/{ISSUE_TEMPLATE,actions,rulesets,workflows}/**', '.mise/tasks/**',
    'docs/package.json'
  ]
}

/**
 * The root of the worktree the suite runs in.
 */
export const ROOT = join(import.meta.dirname, '../../../..')

/**
 * The test checking `READS` against the tree, by its absolute path.
 */
export const CHECKS = join(ROOT, 'docs/.vitepress/tests/reads.test.ts')

/**
 * This module, by its absolute path.
 */
export const TABLE = import.meta.filename

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
  return stale ? [...readers, CHECKS] : readers
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

type Table = { entries: Map<string, string>, rest: string }

/**
 * Splits `text`, a version of this module, into the text of each entry of
 * `READS`, keyed by the module's path from `ROOT`, and the text outside the
 * table, or returns nothing where `text` is missing or no `READS` table of
 * string keys parses from it.
 */
const tableOf = async (text?: string): Promise<Table | undefined> => {
  if (text === undefined) return undefined
  const { parseSync } = await import('vite')
  const table         = parseSync(TABLE, text).program.body
    .flatMap(node => node.type === 'ExportNamedDeclaration' ? node.declaration ?? [] : [])
    .flatMap(declaration => declaration.type === 'VariableDeclaration' ? declaration.declarations : [])
    .find(({ id }) => id.type === 'Identifier' && id.name === 'READS')?.init
  if (table?.type !== 'ObjectExpression') return undefined
  const entries = table.properties.map(property =>
    property.type === 'Property' && property.key.type === 'Literal' && typeof property.key.value === 'string'
      ? [property.key.value, text.slice(property.value.start, property.value.end)] as const
      : undefined)
  return entries.every(entry => entry !== undefined)
    ? { entries: new Map(entries), rest: text.slice(0, table.start) + text.slice(table.end) }
    : undefined
}

/**
 * Lists what an edit to this module from `before` to `after` reaches, as
 * absolute paths: each module whose `READS` entry the edit adds, removes, or
 * changes, and `CHECKS`, where the rest of the module stays as it was, or
 * else `TABLE`, which every test loads through the setup file.
 */
export const rereadOf = async (before?: string, after?: string): Promise<string[]> => {
  const [was, now] = await Promise.all([before, after].map(text => tableOf(text)))
  if (was === undefined || now === undefined || was.rest !== now.rest) return [TABLE]
  return [...new Set([...was.entries.keys(), ...now.entries.keys()])]
    .filter(module => was.entries.get(module) !== now.entries.get(module))
    .map(module => join(ROOT, module))
    .concat(CHECKS)
}
