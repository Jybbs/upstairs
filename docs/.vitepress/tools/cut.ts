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
 * Decides what the cut does for `version`, reading the releases only where
 * the version moved from `previous`, so a run with no `previous` reads them
 * whatever the version. A release carries the version where its `tag_name`
 * equals it, a field a draft sets before its tag exists.
 *
 * Args:
 *   read     : Reads every release of the repository, drafts included.
 *   version  : The version the manifest carries at `HEAD`.
 *   previous : The version the manifest carried before the push.
 */
export const outcomeOf = async (
  read      : () => Promise<Release[]>,
  version   : string,
  previous? : string
): Promise<Outcome> => {
  if (previous === version) return 'unmoved'
  const release = (await read()).find(({ tag_name }) => tag_name === version)
  return !release ? 'create' : release.draft ? 'drafted' : 'published'
}

if (import.meta.main) {
  const repository = process.env.GITHUB_REPOSITORY
  const version    = manifest.version
  const previous   = process.env.GITHUB_EVENT_NAME === 'push'
    ? (await $`git show HEAD~1:docs/package.json`.json()).version as string
    : undefined
  const read = async (): Promise<Release[]> =>
    (await $`gh api --paginate --slurp repos/${repository}/releases`.json()).flat()
  const outcome = await outcomeOf(read, version, previous)
  const flags   = [
    '--draft', '--generate-notes', '--repo', repository, '--target', 'main', '--title', version
  ]
  if (outcome === 'create') await $`gh release create ${version} ${flags}`
  console.log(NOTES[outcome](version))
}
