/**
 * Writes a workflow run's summary from the jobs of the run and the `needs`
 * context of its gate, and reads the variables a step of a workflow sets.
 */
import { $ }          from 'bun'
import { appendFile } from 'node:fs/promises'
import { basename }   from 'node:path'

interface Context {
  jobs     : string
  needs    : Needs
  run      : string
  summary  : string
  template : string
}

interface Job {
  conclusion : string | null
  name       : string
  status     : string
}

interface Logbook {
  passed  : boolean
  summary : string
}

export type Needs = Record<string, { outputs?: Record<string, string>, result: string }>

const OUTPUT  = /\{\{([\w-]+)\.([\w-]+)\}\}/g
const PASSING = new Set(['skipped', 'success'])

const outputOf = (needs: Needs, job: string, key: string) => needs[job]?.outputs?.[key] ?? ''

/**
 * Reads the summary file, the jobs endpoint, the `needs` context, the run's
 * address, and the summary template from the variables GitHub Actions sets for
 * a step, where a run outside a workflow writes to standard output with no jobs
 * in `needs`.
 */
export const contextOf = (env: NodeJS.ProcessEnv): Context => {
  const run = `${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
  return {
    jobs     : `repos/${run}/jobs?per_page=100`,
    needs    : needsOf(env),
    run      : `${env.GITHUB_SERVER_URL}/${run}`,
    summary  : env.GITHUB_STEP_SUMMARY ?? '/dev/stdout',
    template : templateOf(env, 'summaries')
  }
}

/**
 * Fills each `{{job.output}}` in `template` with that output of the job the
 * `needs` context holds, leaving out each line naming an output the job did not
 * set, such as one a skipped job would have set.
 */
export const filledOf = (template: string, needs: Needs) => template
  .split('\n')
  .filter(line => [...line.matchAll(OUTPUT)].every(([, job, key]) => outputOf(needs, job, key)))
  .map(line => line.replace(OUTPUT, (_, job, key) => outputOf(needs, job, key)))
  .join('\n')

/**
 * Fills a workflow's summary template from the jobs of its run, writing one row
 * per finished job beside its conclusion and the link to the workflow run, and
 * passes only where every job in the `needs` context its gate reads succeeded
 * or was skipped. A matrix job takes one row per leg, each under the name its
 * leg expands to.
 *
 * Args:
 *   jobs     : The jobs of the run, in the order the run lists them.
 *   needs    : The `needs` context, keyed by job id.
 *   run      : The address of the workflow run.
 *   template : The Markdown holding `{{jobs}}`, `{{run}}`, and each
 *     `{{job.output}}`.
 */
export const logbookOf = (jobs: Job[], needs: Needs, run: string, template: string): Logbook => {
  const rows = jobs
    .filter(job => job.status === 'completed')
    .map(job => `| \`${job.name}\` | ${job.conclusion} |`)
    .join('\n')
  return {
    passed  : Object.values(needs).every(({ result }) => PASSING.has(result)),
    summary : filledOf(template, needs).replace('{{jobs}}', rows).replace('{{run}}', run)
  }
}

/**
 * The `needs` context a step passes in `NEEDS`, empty outside a workflow.
 */
export const needsOf = (env: NodeJS.ProcessEnv): Needs => JSON.parse(env.NEEDS ?? '{}')

/**
 * The template under `folder` named for the workflow a step runs in.
 */
export const templateOf = (env: NodeJS.ProcessEnv, folder: 'comments' | 'summaries') =>
  `.github/scripts/${folder}/${basename(env.GITHUB_WORKFLOW_REF?.split('@')[0] ?? '', '.yml')}.md`

if (import.meta.main) {
  const context  = contextOf(process.env)
  const { jobs } = await $`gh api ${context.jobs}`.json()
  const logbook  = logbookOf(jobs, context.needs, context.run, await Bun.file(context.template).text())
  await appendFile(context.summary, logbook.summary)
  process.exit(logbook.passed ? 0 : 1)
}
