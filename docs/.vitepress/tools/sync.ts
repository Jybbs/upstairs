import { $ } from 'bun'

import manifest        from '../../package.json' with { type: 'json' }
import * as repository from './repository.ts'

export type Live = Pick<repository.Ruleset, 'name'> & { id: number }

interface Request {
  method : 'DELETE' | 'PATCH' | 'POST' | 'PUT'
  path   : string
  body?  : unknown
}

export interface Settings {
  actions    : Record<string, unknown>
  pages      : Record<string, unknown>
  repository : Record<string, unknown>
  toggles    : Record<string, boolean>
  workflow   : Record<string, unknown>
}

const REPOSITORY = 'repos/{owner}/{repo}'

const apply = async (requests: Request[], warnings: string[]) => {
  for (const request of requests) {
    await send(request)
  }
  warnings.forEach(warning => console.log(warning))
}

const labels = async (declared: repository.Repository) => {
  const listed = await $`gh label list --json name --jq .[].name --limit 1000`.text()
  const live   = listed.split('\n').filter(Boolean)
  const sync   = new LabelSync(declared.labels, live)
  await apply(sync.requests, sync.strays)
}

const rulesets = async (declared: repository.Repository) => {
  const settings: Settings = await repository.parseFile(repository.FILES.settings)
  const live: Live[]       = await $`gh api ${`${REPOSITORY}/rulesets`}`.json()
  const site               = !(await $`gh api ${`${REPOSITORY}/pages`}`.nothrow().quiet()).exitCode
  await apply(
    [...requestsOf(site, settings), ...rulesetRequestsOf(live, declared.rulesets)],
    unnamedOf(live, declared.rulesets)
  )
}

const send = async ({ body, method, path }: Request) => {
  const input  = Buffer.from(JSON.stringify(body ?? {}))
  const result = await $`gh api --method ${method} --input - ${path} < ${input}`.nothrow().quiet()
  if (result.exitCode && !(method === 'DELETE' && result.stderr.includes('404'))) {
    throw new Error(`${method} ${path} failed with ${result.stderr.toString().trim()}`)
  }
}

/**
 * Lists the requests that set every repository setting `.github/settings.toml`
 * declares and the About box the site's manifest declares, sending the homepage
 * as its bare domain, where a toggle that is on takes a `PUT` and one that is
 * off takes a `DELETE`. Turning `pages` on sends the `pages` table, through a
 * `POST` creating the site where `site` is false and a `PUT` updating it.
 */
export const requestsOf = (
  site     : boolean,
  settings : Settings,
  about    : Pick<typeof manifest, 'description' | 'homepage' | 'keywords'> = manifest
): Request[] => [
  {
    method : 'PATCH',
    path   : REPOSITORY,
    body   : {
      ...settings.repository,
      description : about.description,
      homepage    : new URL(about.homepage).host
    }
  },
  { body: { names: about.keywords }, method: 'PUT', path: `${REPOSITORY}/topics` },
  { body: settings.actions, method: 'PUT', path: `${REPOSITORY}/actions/permissions` },
  { body: settings.workflow, method: 'PUT', path: `${REPOSITORY}/actions/permissions/workflow` },
  ...Object.entries(settings.toggles).map(([toggle, on]): Request => {
    const path = `${REPOSITORY}/${toggle}`
    if (!on) return { method: 'DELETE', path }
    return toggle === 'pages'
      ? { body: settings.pages, method: site ? 'PUT' : 'POST', path }
      : { method: 'PUT', path }
  })
]

/**
 * Lists the requests that write each ruleset to GitHub, updating the live
 * ruleset of the same name and creating one where no live ruleset has that
 * name.
 */
export const rulesetRequestsOf = (live: Live[], rulesets: repository.Ruleset[]): Request[] =>
  rulesets.map(ruleset => {
    const id = live.find(other => other.name === ruleset.name)?.id
    return id
      ? { body: ruleset, method: 'PUT', path: `${REPOSITORY}/rulesets/${id}` }
      : { body: ruleset, method: 'POST', path: `${REPOSITORY}/rulesets` }
  })

/**
 * Lists a sentence for each live ruleset whose name no file under
 * `.github/rulesets/` declares.
 */
export const unnamedOf = (live: Live[], rulesets: repository.Ruleset[]): string[] =>
  live
    .filter(ruleset => !rulesets.some(other => other.name === ruleset.name))
    .map(ruleset => `The live ruleset ${ruleset.name} has no file under .github/rulesets/`)

/**
 * Pairs the rows of the label registry with the names of the labels live on
 * GitHub, matching each row to the live label it writes to.
 */
export class LabelSync {
  constructor(readonly declared: repository.RegistryLabel[], readonly live: string[]) {}

  /**
   * The requests that write each registry row to GitHub, updating the live
   * label of the same name, renaming the live label the row renames, and
   * creating one where neither is live.
   */
  get requests(): Request[] {
    return this.declared.map(label => {
      const { color, description, name } = label
      const from                         = this.liveNameOf(label)
      return from
        ? {
          body   : { color, description, new_name: name },
          method : 'PATCH',
          path   : `${REPOSITORY}/labels/${encodeURIComponent(from)}`
        }
        : { body: { color, description, name }, method: 'POST', path: `${REPOSITORY}/labels` }
    })
  }

  /**
   * A sentence for each live label the registry neither names nor renames.
   */
  get strays(): string[] {
    const claimed = new Set(this.declared.map(label => this.liveNameOf(label)))
    return this.live
      .filter(name => !claimed.has(name))
      .map(name => `${name} is live on GitHub and missing from ${repository.FILES.labels}`)
  }

  /**
   * The live label a registry row writes to, meaning the live label of its own
   * name, or else the live label it renames, which the registry leaves out and
   * whose word the row shares.
   */
  private liveNameOf(label: repository.RegistryLabel) {
    const word = repository.wordOf(label.name)
    return this.live.includes(label.name)
      ? label.name
      : this.live.find(name =>
        !this.declared.some(other => other.name === name) && repository.wordOf(name) === word)
  }
}

if (import.meta.main) {
  const declared = await repository.Repository.read()
  await (process.argv[2] === 'labels' ? labels(declared) : rulesets(declared))
}
