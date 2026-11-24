import { $ } from 'bun'

import manifest  from '../../../package.json' with { type: 'json' }
import { FILES } from './repository.ts'

type Outcome = keyof typeof NOTES

interface Release {
  draft    : boolean
  id       : number
  name     : string | null
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
    + `in ${FILES.manifest} to the next release`,
  refresh   : (version: string) =>
    `::notice::Refreshed the notes, the tag, and the target of the ${version} draft`
}

/**
 * The exit status `gha:cut` ends on for each outcome, failing the run where a
 * published release carries the version.
 */
export const CODES: Record<Outcome, number> = { create: 0, published: 1, refresh: 0 }

/**
 * Decides what the cut does for `version` from the releases carrying it,
 * running `create` where none does and `refresh` on the newest draft, the one
 * with the highest id, where only drafts do. A release carries the version
 * where its `tag_name` equals it, and a draft also where its `name` does, since
 * GitHub reports a draft's `tag_name` as `untagged-*` once an update leaves it
 * out.
 *
 * Args:
 *   read    : Reads every release of the repository, drafts included.
 *   create  : Creates the draft of `version`.
 *   refresh : Rewrites the notes, the tag, and the target of the draft with
 *     this id.
 *   version : The version the manifest carries at `HEAD`.
 */
export const outcomeOf = async (
  read    : () => Promise<Release[]>,
  create  : () => Promise<unknown>,
  refresh : (id: number) => Promise<unknown>,
  version : string
): Promise<Outcome> => {
  const releases = (await read())
    .filter(({ draft, name, tag_name }) => tag_name === version || (draft && name === version))
  if (releases.some(({ draft }) => !draft)) return 'published'
  const [draft] = releases.toSorted((a, b) => b.id - a.id)
  if (!draft) {
    await create()
    return 'create'
  }
  await refresh(draft.id)
  return 'refresh'
}

/**
 * The draft release of `version` in `repository`, whose tag lands on `target`
 * once it is published, holding the arguments `gh` takes to create the draft
 * and to refresh its notes, its tag, and its target.
 */
export class Draft {
  constructor(
    readonly version     : string,
    readonly repository? : string,
    readonly target?     : string
  ) {}

  /**
   * Reads the repository and the commit the draft of `version` targets from
   * the variables the workflow sets for the step.
   */
  static from(version: string, env: Record<string, string | undefined>): Draft {
    return new Draft(version, env.GITHUB_REPOSITORY, env.GITHUB_SHA)
  }

  /**
   * The arguments that create the draft with the notes GitHub generates.
   */
  get createArgs(): (string | undefined)[] {
    return [
      'release', 'create', this.version, '--draft', '--generate-notes',
      '--repo', this.repository, '--target', this.target, '--title', this.version
    ]
  }

  /**
   * The arguments that generate the notes of the version, counted from the
   * release before it up to `target`.
   */
  get notesArgs(): string[] {
    return [
      'api', '--method', 'POST', `repos/${this.repository}/releases/generate-notes`, ...this.tagArgs
    ]
  }

  /**
   * The fields naming the version as the tag and `target` as the commit it
   * lands on, which the notes and the refresh both send.
   */
  private get tagArgs(): string[] {
    return ['--raw-field', `tag_name=${this.version}`, '--raw-field', `target_commitish=${this.target}`]
  }

  /**
   * Replaces the notes of the draft `id` with the ones `notes` generates for
   * the version through `notesArgs`, and sets its tag and its target, through
   * `send`.
   */
  async refresh(
    id    : number,
    notes : (args: string[]) => Promise<{ body: string }>,
    send  : (args: string[]) => Promise<unknown>
  ): Promise<unknown> {
    return send(this.refreshArgs(id, (await notes(this.notesArgs)).body))
  }

  /**
   * The arguments that set the notes of the draft `id` to `body`, its tag to
   * the version, and its target to `target`.
   */
  refreshArgs(id: number, body: string): string[] {
    return [
      'api', '--method', 'PATCH', `repos/${this.repository}/releases/${id}`,
      '--raw-field', `body=${body}`, ...this.tagArgs, '--silent'
    ]
  }
}

if (import.meta.main) {
  const draft   = Draft.from(manifest.version, process.env)
  const read    = async (): Promise<Release[]> =>
    (await $`gh api --paginate --slurp repos/${draft.repository}/releases`.json()).flat()
  const create  = () => $`gh ${draft.createArgs}`
  const refresh = (id: number) => draft.refresh(id, args => $`gh ${args}`.json(), args => $`gh ${args}`)
  const outcome = await outcomeOf(read, create, refresh, draft.version)
  console.log(NOTES[outcome](draft.version))
  process.exitCode = CODES[outcome]
}
