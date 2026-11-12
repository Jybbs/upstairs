import { $ } from 'bun'

import manifest from '../../package.json' with { type: 'json' }

type Outcome = keyof typeof NOTES

interface Release {
  draft    : boolean
  tag_name : string
}

/**
 * The workflow command `gha:cut` prints for each outcome, which GitHub Actions
 * shows as an annotation naming the version on the workflow run's page.
 */
export const NOTES = {
  create    : (version: string) => `::notice::Drafted ${version} with generated notes`,
  drafted   : (version: string) => `::notice::A draft carries ${version}, which stays as it is`,
  published : (version: string) => `::warning::A published release carries ${version}, so no draft is cut`,
  unmoved   : (version: string) => `::notice::The version stays at ${version}, so no draft is cut`
}

/**
 * Decides what the cut does for `version` and runs `create` where no release
 * carries it, reading the releases only where the version moved from
 * `previous`, so a run with no `previous` reads them whatever the version. A
 * release carries the version where its `tag_name` equals it, a field a draft
 * sets before its tag exists.
 *
 * Args:
 *   read     : Reads every release of the repository, drafts included.
 *   create   : Creates the draft of `version`.
 *   version  : The version the manifest carries at `HEAD`.
 *   previous : The version the manifest carried before the push.
 */
export const outcomeOf = async (
  read      : () => Promise<Release[]>,
  create    : () => Promise<unknown>,
  version   : string,
  previous? : string
): Promise<Outcome> => {
  if (previous === version) return 'unmoved'
  const release = (await read()).find(({ tag_name }) => tag_name === version)
  if (release) return release.draft ? 'drafted' : 'published'
  await create()
  return 'create'
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
 * Reads the commit a push moved from, which a run by hand leaves unset, the
 * repository, and the commit the draft targets from the variables the
 * workflow sets for the step.
 */
export const contextOf = (env: Record<string, string | undefined>) => ({
  before     : env.GITHUB_EVENT_NAME === 'push' ? env.BEFORE : undefined,
  repository : env.GITHUB_REPOSITORY,
  target     : env.GITHUB_SHA
})

if (import.meta.main) {
  const { before, repository, target } = contextOf(process.env)
  const version  = manifest.version
  const previous = before
    ? (await $`git show ${before}:docs/package.json`.json()).version as string
    : undefined
  const read = async (): Promise<Release[]> =>
    (await $`gh api --paginate --slurp repos/${repository}/releases`.json()).flat()
  const create = () => $`gh ${draftOf(version, repository, target)}`
  console.log(NOTES[await outcomeOf(read, create, version, previous)](version))
}
