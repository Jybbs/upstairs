import { join } from 'node:path'

import { describe, expect } from 'vitest'

import { ROOT } from '../common/reads.ts'
import { it }   from '../common/selections.ts'

describe('the reads plugin', () => {
  it.for<[string, string]>([
    ["the crate's own tests, which its build leaves out", 'rust/tests/answers/main.rs'],
    ['the cargo-deny settings under rust/.cargo/', 'rust/.cargo/deny.toml']
  ])('selects the tests an edit to %s reaches', { tags: ['slow'] }, async ([, file], { selectedAfter }) => {
    expect(await selectedAfter(async () => [join(ROOT, file)])).toEqual([])
  })
})
