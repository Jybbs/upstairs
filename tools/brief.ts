import { $ }          from 'bun'
import { appendFile } from 'node:fs/promises'
import { basename }   from 'node:path'

interface Brief {
  passed  : boolean
  summary : string
}

interface Job {
  conclusion : string | null
  name       : string
  status     : string
}

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
export const briefOf = (
  jobs     : Job[],
  needs    : Record<string, { result: string }>,
  run      : string,
  template : string
): Brief => {
  const rows = jobs
    .filter(job => job.status === 'completed')
    .map(job => `| \`${job.name}\` | ${job.conclusion} |`)
    .join('\n')
  return {
    passed  : Object.values(needs).every(({ result }) => result === 'success'),
    summary : template.replace('{{jobs}}', rows).replace('{{run}}', run)
  }
}

if (import.meta.main) {
  const env      = process.env
  const file     = basename(env.GITHUB_WORKFLOW_REF?.split('@')[0] ?? '', '.yml')
  const path     = `repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/jobs?per_page=100`
  const { jobs } = await $`gh api ${path}`.json()
  const brief    = briefOf(
    jobs,
    JSON.parse(env.NEEDS ?? '{}'),
    `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    await Bun.file(`.github/scripts/summaries/${file}.md`).text()
  )
  await appendFile(env.GITHUB_STEP_SUMMARY ?? '/dev/stdout', brief.summary)
  process.exit(brief.passed ? 0 : 1)
}
