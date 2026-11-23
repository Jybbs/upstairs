import { join } from 'node:path'

import { describe, expect } from 'vitest'

import { ROOT } from '../common/reads.ts'
import { it }   from '../common/selections.ts'

/**
 * The tests loading the crate's build under `rust/pkg/`, by their paths from
 * the folder of the suite.
 */
const BUILT = [
  'lib/orbit/catalog.test.ts', 'lib/orbit/looks.test.ts', 'lib/orbit/worker.test.ts',
  'lib/state/drawings.test.ts', 'theme/LookAngles.test.ts', 'theme/OrbitAges.test.ts',
  'theme/PeakSearch.test.ts', 'theme/index.test.ts'
]

describe('the reads plugin', () => {
  it.for<[string, string, string[]]>([
    ["the crate's sources", 'rust/src/lib.rs', BUILT],
    ["the crate's manifest", 'rust/Cargo.toml', [...BUILT, 'lib/site/licenses.test.ts'].sort()],
    ["the crate's lockfile", 'rust/Cargo.lock', [...BUILT, 'lib/site/provenance.test.ts'].sort()]
  ])('selects the tests an edit to %s reaches', { tags: ['slow'] }, async ([, file, tests], { selectedAfter }) => {
    expect(await selectedAfter(async () => [join(ROOT, file)]))
      .toEqual(tests.map(test => join(ROOT, 'docs/.vitepress/tests', test)))
  })
})
