import { join } from 'node:path'

import { describe, expect } from 'vitest'

import { ROOT } from '../common/reads.ts'
import { it }   from '../common/selections.ts'

describe('the reads plugin', () => {
  it.for<[string, string, string[]]>([
    ['a file under docs/public/ that one test reads', 'docs/public/_headers', ['config.test.ts']],
    ['a badge no test reads', 'docs/public/badges/rust.svg', []]
  ])('selects the tests an edit to %s reaches', { tags: ['slow'] }, async ([, file, tests], { selectedAfter }) => {
    expect(await selectedAfter(async () => [join(ROOT, file)]))
      .toEqual(tests.map(test => join(ROOT, 'docs/.vitepress/tests', test)))
  })
})
