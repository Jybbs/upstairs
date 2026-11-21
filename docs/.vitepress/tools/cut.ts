import { $ } from 'bun'

import manifest from '../../package.json' with { type: 'json' }

type Outcome = keyof typeof NOTES

interface Release {
  draft    : boolean
  id       : number
  tag_name : string
}

/**
 * The workflow command `gha:cut` prints for each outcome, which GitHub Actions
 * shows as an annotation naming the version on the workflow run's page.
 */
export const NOTES = {
  create    : (version: string) => `::notice::Drafted ${version} with generated notes`,
  published : (version: string) =>
      `::error::A published release carries ${version}, so run mise bump to move the version `
    + 'in docs/package.json to the next release',
  refresh   : (version: string) => `::notice::Refreshed the notes and the target of the ${version} draft`
}

/**
 * Decides what the cut does for `version` from the releases carrying it,
 * running `create` where none does and `refresh` on the draft where only a
 * draft does. A release carries the version where its `tag_name` equals it, a
 * field a draft sets before its tag exists.
 *
 * Args:
 *   read    : Reads every release of the repository, drafts included.
 *   create  : Creates the draft of `version`.
 *   refresh : Rewrites the notes and the target of the draft with this id.
 *   version : The version the manifest carries at `HEAD`.
 */
export const outcomeOf = async (
  read    : () => Promise<Release[]>,
  create  : () => Promise<unknown>,
  refresh : (id: number) => Promise<unknown>,
  version : string
): Promise<Outcome> => {
  const releases = (await read()).filter(({ tag_name }) => tag_name === version)
  if (releases.some(({ draft }) => !draft)) return 'published'
  const [draft] = releases
  if (!draft) {
    await create()
    return 'create'
  }
  await refresh(draft.id)
  return 'refresh'
}

/**
 * The arguments `gh` takes to create `version` in `repository` as a draft
 * with the notes GitHub generates, whose tag lands on `target` once the draft
 * is published.
 */
export const draftOf = (version: string, repository?: string, target?: string) => [
  'release', 'create', version,
  '--draft', '--generate-notes', '--repo', repository, '--target', target, '--title', version
]

/**
 * The arguments `gh` takes to generate the notes of `version` in
 * `repository`, counted from the release before it up to `target`.
 */
export const notesOf = (version: string, repository?: string, target?: string) => [
  'api', '--method', 'POST', `repos/${repository}/releases/generate-notes`,
  '--raw-field', `tag_name=${version}`, '--raw-field', `target_commitish=${target}`
]

/**
 * The arguments `gh` takes to set the notes of the draft `id` in `repository`
 * to `body` and move its target to `target`.
 */
export const refreshOf = (id: number, body: string, repository?: string, target?: string) => [
  'api', '--method', 'PATCH', `repos/${repository}/releases/${id}`,
  '--raw-field', `body=${body}`, '--raw-field', `target_commitish=${target}`, '--silent'
]

/**
 * Reads the repository and the commit the draft targets from the variables
 * the workflow sets for the step.
 */
export const contextOf = (env: Record<string, string | undefined>) =>
  ({ repository: env.GITHUB_REPOSITORY, target: env.GITHUB_SHA })

if (import.meta.main) {
  const { repository, target } = contextOf(process.env)
  const version = manifest.version
  const read    = async (): Promise<Release[]> =>
    (await $`gh api --paginate --slurp repos/${repository}/releases`.json()).flat()
  const create  = () => $`gh ${draftOf(version, repository, target)}`
  const refresh = async (id: number) => {
    const { body } = await $`gh ${notesOf(version, repository, target)}`.json()
    return $`gh ${refreshOf(id, body, repository, target)}`
  }
  const outcome = await outcomeOf(read, create, refresh, version)
  console.log(NOTES[outcome](version))
  process.exitCode = outcome === 'published' ? 1 : 0
}
