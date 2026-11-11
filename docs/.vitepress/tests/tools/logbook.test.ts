import { describe, expect, it } from 'vitest'

import { contextOf, filledOf, logbookOf } from '../../tools/logbook.ts'

const RUN      = 'https://github.com/Jybbs/upstairs/actions/runs/1'
const TEMPLATE = '| **Job** | **Result** |\n|---|---|\n{{jobs}}\n\n[The workflow run]({{run}})'

const job = (conclusion: string | null, name: string, status = 'completed') => ({ conclusion, name, status })

describe('logbookOf', () => {
  it.each([
    ['every job succeeded', { check: { result: 'success' } }, true],
    ['a job failed', { check: { result: 'failure' } }, false],
    ['a job was skipped', { site: { result: 'skipped' } }, true],
    ['a job was cancelled', { check: { result: 'cancelled' } }, false],
    ['one job of two failed', { check: { result: 'failure' }, prune: { result: 'success' } }, false],
    ['the need of a skipped job failed', { press: { result: 'failure' }, site: { result: 'skipped' } }, false]
  ])('passes only where %s', (_, needs, passed) =>
    expect(logbookOf([], needs, RUN, TEMPLATE).passed).toBe(passed))

  it('writes one row per finished job under its expanded name, leaving out the gate still running', () => {
    const jobs = [
      job('success', '🩺 Advisories'),
      job('failure', '🔗 Links'),
      job(null, '📓 Logbook', 'in_progress')
    ]
    expect(logbookOf(jobs, { check: { result: 'failure' } }, RUN, TEMPLATE).summary).toBe(
        '| **Job** | **Result** |\n|---|---|\n| `🩺 Advisories` | success |\n| `🔗 Links` | failure |\n\n'
      + `[The workflow run](${RUN})`
    )
  })

  it('fills each job output the template names in the summary', () => {
    const needs = { preview: { outputs: { url: 'u' }, result: 'success' } }
    expect(logbookOf([], needs, RUN, `${TEMPLATE}\n\nAt {{preview.url}}.`).summary)
      .toBe(`| **Job** | **Result** |\n|---|---|\n\n\n[The workflow run](${RUN})\n\nAt u.`)
  })
})

describe('filledOf', () => {
  const template = 'Jobs\n\nPublished at {{preview.alias}} and {{preview.url}}.\nDone'
  const dropped  = 'Jobs\n\nDone'

  it.each([
    ['fills each output the job set', { alias: 'a', url: 'u' }, 'Jobs\n\nPublished at a and u.\nDone'],
    ['leaves out a line naming an output the job left unset', { alias: 'a' }, dropped],
    ['leaves out a line naming a job that set no outputs, as a skipped job does', {}, dropped]
  ])('%s', (_, outputs, filled) =>
    expect(filledOf(template, { preview: { outputs, result: 'success' } })).toBe(filled))

  it('fills an output whose job id and name carry a hyphen', () => {
    const needs = { 'pull-preview': { outputs: { 'page-url': 'u' }, result: 'success' } }
    expect(filledOf('At {{pull-preview.page-url}}', needs)).toBe('At u')
  })

  it('leaves out a line naming a job the run lacks', () =>
    expect(filledOf(template, {})).toBe(dropped))
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
