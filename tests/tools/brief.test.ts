import { describe, expect, it } from 'vitest'

import { briefOf } from '../../tools/brief.ts'

const RUN      = 'https://github.com/Jybbs/upstairs/actions/runs/1'
const TEMPLATE = '| **Job** | **Result** |\n|---|---|\n{{jobs}}\n\n[The workflow run]({{run}})'
const WORKFLOW = { jobs: { check: { name: '${{ matrix.name }}' }, prune: { name: '🧹 Prune' } } }

describe('briefOf', () => {
  it.each([
    ['every job succeeded', { prune: { result: 'success' } }, true],
    ['a job failed', { prune: { result: 'failure' } }, false],
    ['a job was skipped', { prune: { result: 'skipped' } }, false],
    ['a job was cancelled', { prune: { result: 'cancelled' } }, false]
  ])('passes only where %s', (_, needs, passed) =>
    expect(briefOf(needs, RUN, TEMPLATE, WORKFLOW).passed).toBe(passed))

  it('writes one row per job under its name, falling back to its id, and links the run', () => {
    const needs = { prune: { result: 'success' }, save: { result: 'failure' } }
    expect(briefOf(needs, RUN, TEMPLATE, WORKFLOW).summary).toBe(
        '| **Job** | **Result** |\n|---|---|\n| `🧹 Prune` | success |\n| `save` | failure |\n\n'
      + `[The workflow run](${RUN})`
    )
  })
})
