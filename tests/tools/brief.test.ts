import { describe, expect, it } from 'vitest'

import { briefOf } from '../../tools/brief.ts'

const RUN      = 'https://github.com/Jybbs/upstairs/actions/runs/1'
const TEMPLATE = '| **Job** | **Result** |\n|---|---|\n{{jobs}}\n\n[The workflow run]({{run}})'

const job = (name: string, conclusion: string | null, status = 'completed') => ({ conclusion, name, status })

describe('briefOf', () => {
  it.each([
    ['every job succeeded', { check: { result: 'success' } }, true],
    ['a job failed', { check: { result: 'failure' } }, false],
    ['a job was skipped', { check: { result: 'skipped' } }, false],
    ['a job was cancelled', { check: { result: 'cancelled' } }, false]
  ])('passes only where %s', (_, needs, passed) =>
    expect(briefOf([], needs, RUN, TEMPLATE).passed).toBe(passed))

  it('writes one row per finished job under its expanded name, leaving out the gate still running', () => {
    const jobs = [
      job('🩺 Advisories', 'success'),
      job('🔗 Links', 'failure'),
      job('🔭 Brief', null, 'in_progress')
    ]
    expect(briefOf(jobs, { check: { result: 'failure' } }, RUN, TEMPLATE).summary).toBe(
        '| **Job** | **Result** |\n|---|---|\n| `🩺 Advisories` | success |\n| `🔗 Links` | failure |\n\n'
      + `[The workflow run](${RUN})`
    )
  })
})
