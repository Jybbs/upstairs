/**
 * Writes a workflow run's summary from the jobs of the run and the `needs`
 * context of its gate.
 */
import { $ }          from 'bun'
import { appendFile } from 'node:fs/promises'
import { basename }   from 'node:path'

interface Context {
  fields   : Fields
  jobs     : string
  needs    : Needs
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

type Fields = Record<string, string>

type Needs = Record<string, { outputs?: Fields, result: string }>

const FIELD   = /\{\{([\w.-]+)\}\}/g
const LIST    = new Intl.ListFormat('en')
const PASSING = new Set(['skipped', 'success'])

/**
 * Fills each `{{field}}` in `template` from `fields`, leaving out each line
 * naming a field that is unset or empty.
 */
const filledOf = (template: string, fields: Fields) => template
  .split('\n')
  .filter(line => [...line.matchAll(FIELD)].every(([, key]) => fields[key]))
  .map(line => line.replace(FIELD, (_, key) => fields[key]))
  .join('\n')

/**
 * Keys each output of each job in `needs` as `job.output`.
 */
const outputsOf = (needs: Needs): Fields => Object.fromEntries(
  Object.entries(needs).flatMap(([job, { outputs = {} }]) =>
    Object.entries(outputs).map(([key, value]) => [`${job}.${key}`, value]))
)

/**
 * Reads the summary file, the jobs endpoint, the `needs` context, the summary
 * template, and the run's address, its commit, and its branch from the
 * variables GitHub Actions sets for a step, where a run outside a workflow
 * writes to standard output with no jobs in `needs`. The commit and the branch
 * come from the `SHA` and `REF` a workflow sets, and stay unset where it sets
 * neither.
 */
export const contextOf = (env: Record<string, string | undefined>): Context => {
  const repository = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`
  const file       = basename(env.GITHUB_WORKFLOW_REF?.split('@')[0] ?? '', '.yml')
  return {
    fields   : {
      commit : env.SHA ? `[\`${env.SHA.slice(0, 7)}\`](${repository}/commit/${env.SHA})` : '',
      ref    : env.REF ?? '',
      run    : `${repository}/actions/runs/${env.GITHUB_RUN_ID}`
    },
    jobs     : `repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/jobs?per_page=100`,
    needs    : JSON.parse(env.NEEDS ?? '{}'),
    summary  : env.GITHUB_STEP_SUMMARY ?? '/dev/stdout',
    template : `.github/scripts/summaries/${file}.md`
  }
}

/**
 * Fills a workflow's summary template from the jobs of its run, writing one row
 * per finished job beside its conclusion, and passes only where every job in
 * the `needs` context its gate reads succeeded or was skipped. A matrix job
 * takes one row per leg, each under the name its leg expands to.
 *
 * Args:
 *   jobs     : The jobs of the run, in the order the run lists them.
 *   needs    : The `needs` context, keyed by job id.
 *   template : The Markdown holding `{{jobs}}` and any other `{{field}}`, where
 *     `{{failed}}` lists the jobs that failed and `{{job.output}}` names an
 *     output of a job in `needs`.
 *   fields   : The run's own fields, such as `run`, `commit`, and `ref`.
 */
export const logbookOf = (jobs: Job[], needs: Needs, template: string, fields: Fields): Logbook => {
  const finished = jobs.filter(job => job.status === 'completed')
  const rows     = finished.map(job => `| \`${job.name}\` | ${job.conclusion} |`).join('\n')
  const failed   = finished.filter(job => job.conclusion === 'failure').map(job => `\`${job.name}\``)
  return {
    passed  : Object.values(needs).every(({ result }) => PASSING.has(result)),
    summary : filledOf(template.replace('{{jobs}}', rows), {
      ...fields,
      ...outputsOf(needs),
      failed : LIST.format(failed)
    })
  }
}

if (import.meta.main) {
  const context  = contextOf(process.env)
  const { jobs } = await $`gh api ${context.jobs}`.json()
  const logbook  = logbookOf(jobs, context.needs, await Bun.file(context.template).text(), context.fields)
  await appendFile(context.summary, logbook.summary)
  process.exit(logbook.passed ? 0 : 1)
}
