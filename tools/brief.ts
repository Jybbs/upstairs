import { appendFile } from 'node:fs/promises'
import { basename }   from 'node:path'

import { type Workflow, parseFile } from './repository.ts'

interface Brief {
  passed  : boolean
  summary : string
}

/**
 * Fills a workflow's summary template from the `needs` context its gate reads,
 * writing one row per job beside its result and the link to the workflow run,
 * and passes only where every job succeeded.
 *
 * Args:
 *   needs    : The `needs` context, keyed by job id.
 *   run      : The address of the workflow run.
 *   template : The Markdown holding `{{jobs}}` and `{{run}}`.
 *   workflow : The workflow the gate ends, for the name of each job.
 */
export const briefOf = (
  needs    : Record<string, { result: string }>,
  run      : string,
  template : string,
  workflow : Pick<Workflow, 'jobs'>
): Brief => {
  const jobs = Object.entries(needs)
    .map(([id, { result }]) => `| \`${workflow.jobs[id]?.name ?? id}\` | ${result} |`)
    .join('\n')
  return {
    passed  : Object.values(needs).every(({ result }) => result === 'success'),
    summary : template.replace('{{jobs}}', jobs).replace('{{run}}', run)
  }
}

if (import.meta.main) {
  const env      = process.env
  const file     = basename(env.GITHUB_WORKFLOW_REF?.split('@')[0] ?? '', '.yml')
  const workflow = await parseFile(`.github/workflows/${file}.yml`)
  const brief    = briefOf(
    JSON.parse(env.NEEDS ?? '{}'),
    `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    await Bun.file(`.github/scripts/summaries/${file}.md`).text(),
    workflow
  )
  await appendFile(env.GITHUB_STEP_SUMMARY ?? '/dev/stdout', brief.summary)
  process.exit(brief.passed ? 0 : 1)
}
