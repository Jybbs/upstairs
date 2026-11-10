import { $ }          from 'bun'
import { appendFile } from 'node:fs/promises'
import { basename }   from 'node:path'

interface Brief {
  passed  : boolean
  summary : string
}

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

type Needs = Record<string, { result: string }>

/**
 * Fills a workflow's summary template from the jobs of its run, writing one row
 * per finished job beside its conclusion and the link to the workflow run, and
 * passes only where every job in the `needs` context its gate reads succeeded.
 * A matrix job takes one row per leg, each under the name its leg expands to.
 *
 * Args:
 *   jobs     : The jobs of the run, in the order the run lists them.
 *   needs    : The `needs` context, keyed by job id.
 *   run      : The address of the workflow run.
 *   template : The Markdown holding `{{jobs}}` and `{{run}}`.
 */
export const briefOf = (jobs: Job[], needs: Needs, run: string, template: string): Brief => {
  const rows = jobs
    .filter(job => job.status === 'completed')
    .map(job => `| \`${job.name}\` | ${job.conclusion} |`)
    .join('\n')
  return {
    passed  : Object.values(needs).every(({ result }) => result === 'success'),
    summary : template.replace('{{jobs}}', rows).replace('{{run}}', run)
  }
}

/**
 * Reads the summary file, the jobs endpoint, the `needs` context, the run's
 * address, and the summary template from the variables GitHub Actions sets for
 * a step, where a run outside a workflow writes to standard output with no jobs
 * in `needs`.
 */
export const contextOf = (env: Record<string, string | undefined>): Context => {
  const run  = `${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
  const file = basename(env.GITHUB_WORKFLOW_REF?.split('@')[0] ?? '', '.yml')
  return {
    jobs     : `repos/${run}/jobs?per_page=100`,
    needs    : JSON.parse(env.NEEDS ?? '{}'),
    run      : `${env.GITHUB_SERVER_URL}/${run}`,
    summary  : env.GITHUB_STEP_SUMMARY ?? '/dev/stdout',
    template : `.github/scripts/summaries/${file}.md`
  }
}

if (import.meta.main) {
  const context  = contextOf(process.env)
  const { jobs } = await $`gh api ${context.jobs}`.json()
  const brief    = briefOf(jobs, context.needs, context.run, await Bun.file(context.template).text())
  await appendFile(context.summary, brief.summary)
  process.exit(brief.passed ? 0 : 1)
}
