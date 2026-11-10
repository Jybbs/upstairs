import { describe, expect, it } from 'vitest'

import { briefOf, contextOf } from '../../tools/brief.ts'

const RUN      = 'https://github.com/Jybbs/upstairs/actions/runs/1'
const TEMPLATE = '| **Job** | **Result** |\n|---|---|\n{{jobs}}\n\n[The workflow run]({{run}})'

const job = (conclusion: string | null, name: string, status = 'completed') => ({ conclusion, name, status })

describe('briefOf', () => {
  it.each([
    ['every job succeeded', { check: { result: 'success' } }, true],
    ['a job failed', { check: { result: 'failure' } }, false],
    ['a job was skipped', { check: { result: 'skipped' } }, false],
    ['a job was cancelled', { check: { result: 'cancelled' } }, false],
    ['one job of two failed', { check: { result: 'failure' }, prune: { result: 'success' } }, false]
  ])('passes only where %s', (_, needs, passed) =>
    expect(briefOf([], needs, RUN, TEMPLATE).passed).toBe(passed))

  it('writes one row per finished job under its expanded name, leaving out the gate still running', () => {
    const jobs = [
      job('success', '🩺 Advisories'),
      job('failure', '🔗 Links'),
      job(null, '🔭 Brief', 'in_progress')
    ]
    expect(briefOf(jobs, { check: { result: 'failure' } }, RUN, TEMPLATE).summary).toBe(
        '| **Job** | **Result** |\n|---|---|\n| `🩺 Advisories` | success |\n| `🔗 Links` | failure |\n\n'
      + `[The workflow run](${RUN})`
    )
  })
})

describe('contextOf', () => {
  it('reads every path and the needs context from the variables of a workflow step', () =>
    expect(contextOf({
      GITHUB_REPOSITORY   : 'Jybbs/upstairs',
      GITHUB_RUN_ID       : '1',
      GITHUB_SERVER_URL   : 'https://github.com',
      GITHUB_STEP_SUMMARY : '/tmp/summary.md',
      GITHUB_WORKFLOW_REF : 'Jybbs/upstairs/.github/workflows/warm.yml@refs/heads/main',
      NEEDS               : '{"save":{"result":"success"}}'
    })).toEqual({
      jobs     : 'repos/Jybbs/upstairs/actions/runs/1/jobs?per_page=100',
      needs    : { save: { result: 'success' } },
      run      : RUN,
      summary  : '/tmp/summary.md',
      template : '.github/scripts/summaries/warm.md'
    }))

  it('writes to standard output with no jobs in needs outside a workflow', () =>
    expect(contextOf({})).toMatchObject({ needs: {}, summary: '/dev/stdout' }))
})
