import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { contextOf, logbookOf } from '../../tools/logbook.ts'

const BRANCH   = '20/pull-request-previews'
const COMMIT   = '[`abc1234`](https://github.com/Jybbs/upstairs/commit/abc1234def)'
const DEPLOY   = readFileSync(new URL('../../../../.github/scripts/summaries/deploy.md', import.meta.url), {
  encoding : 'utf8'
})
const PREVIEW  = 'https://1.upstairs.pages.dev'
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
    expect(logbookOf([], needs, TEMPLATE, { run: RUN }).passed).toBe(passed))

  it('writes one row per finished job under its expanded name, leaving out the gate still running', () => {
    const jobs = [
      job('success', '🩺 Advisories'),
      job('failure', '🔗 Links'),
      job(null, '📓 Logbook', 'in_progress')
    ]
    expect(logbookOf(jobs, { check: { result: 'failure' } }, TEMPLATE, { run: RUN }).summary).toBe(
        '| **Job** | **Result** |\n|---|---|\n| `🩺 Advisories` | success |\n| `🔗 Links` | failure |\n\n'
      + `[The workflow run](${RUN})`
    )
  })

  it.each([
    ['fills each output the job set', { alias: 'a', url: 'u' }, 'Jobs\n\nPublished at a and u.\nDone'],
    ['leaves out a line naming an output the job left unset', { alias: 'a' }, 'Jobs\n\nDone'],
    ['leaves out a line naming a job that set no outputs, as a skipped job does', {}, 'Jobs\n\nDone']
  ])('%s', (_, outputs, summary) => {
    const template = 'Jobs\n\nPublished at {{site.alias}} and {{site.url}}.\nDone'
    expect(logbookOf([], { site: { outputs, result: 'success' } }, template, {}).summary).toBe(summary)
  })

  it('fills an output whose job id and name carry a hyphen', () => {
    const needs = { 'pull-preview': { outputs: { 'page-url': 'u' }, result: 'success' } }
    expect(logbookOf([], needs, 'At {{pull-preview.page-url}}', {}).summary).toBe('At u')
  })

  it('leaves out a line naming an empty field', () =>
    expect(logbookOf([], {}, 'Built on `{{ref}}`.\nDone', { ref: '' }).summary).toBe('Done'))

  it.each([
    ['one failed job', [job('failure', '📰 Press')], '`📰 Press` failed.\nDone'],
    ['each of several failed jobs', [job('failure', '📰 Press'), job('failure', '📡 Catalog')],
      '`📰 Press` and `📡 Catalog` failed.\nDone'],
    ['no failed job, leaving the line out', [job('success', '📰 Press')], 'Done']
  ])('names %s in the failed line', (_, jobs, summary) =>
    expect(logbookOf(jobs, {}, '{{failed}} failed.\nDone', {}).summary).toBe(summary))

  it.each([
    [
      'the address the site job deployed to, beside the commit and the branch',
      [job('success', '📰 Press'), job('success', '🌐 Site')],
      { site: { outputs: { url: PREVIEW }, result: 'success' } },
      `The site is live at [${PREVIEW}](${PREVIEW}), built from ${COMMIT} on \`${BRANCH}\`.`,
      'failed at'
    ],
    [
      'the job that failed, beside the commit and the branch',
      [job('failure', '📰 Press')],
      { press: { result: 'failure' }, site: { result: 'skipped' } },
      `\`📰 Press\` failed at ${COMMIT} on \`${BRANCH}\`.`,
      'is live at'
    ]
  ])('opens the Deploy summary on %s', (_, jobs, needs, line, absent) => {
    const { summary } = logbookOf(jobs, needs, DEPLOY, { commit: COMMIT, ref: BRANCH, run: RUN })
    expect(summary).toContain(line)
    expect(summary).not.toContain(absent)
  })
})

describe('contextOf', () => {
  it('reads every path, the needs context, and the run\'s fields from the variables of a workflow step', () =>
    expect(contextOf({
      GITHUB_REPOSITORY   : 'Jybbs/upstairs',
      GITHUB_RUN_ID       : '1',
      GITHUB_SERVER_URL   : 'https://github.com',
      GITHUB_STEP_SUMMARY : '/tmp/summary.md',
      GITHUB_WORKFLOW_REF : 'Jybbs/upstairs/.github/workflows/deploy.yml@refs/heads/main',
      NEEDS               : '{"save":{"result":"success"}}',
      REF                 : BRANCH,
      SHA                 : 'abc1234def'
    })).toEqual({
      fields   : { commit: COMMIT, ref: BRANCH, run: RUN },
      jobs     : 'repos/Jybbs/upstairs/actions/runs/1/jobs?per_page=100',
      needs    : { save: { result: 'success' } },
      summary  : '/tmp/summary.md',
      template : '.github/scripts/summaries/deploy.md'
    }))

  it('leaves the commit and the branch empty where the workflow sets neither', () =>
    expect(contextOf({}).fields).toMatchObject({ commit: '', ref: '' }))

  it('writes to standard output with no jobs in needs outside a workflow', () =>
    expect(contextOf({})).toMatchObject({ needs: {}, summary: '/dev/stdout' }))
})
