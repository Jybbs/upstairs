import { $ } from 'bun'

import manifest        from '../../package.json' with { type: 'json' }
import * as repository from './repository.ts'

type Live = Pick<repository.Ruleset, 'name'> & { id: number }

interface Request {
  method : 'DELETE' | 'PATCH' | 'POST' | 'PUT'
  path   : string
  body?  : unknown
}

export interface Settings {
  actions    : Record<string, unknown>
  repository : Record<string, unknown>
  toggles    : Record<string, boolean>
  workflow   : Record<string, unknown>
}

const REPOSITORY = 'repos/{owner}/{repo}'

const labels = async (declared: repository.Repository) => {
  for (const label of declared.labels) {
    await $`gh label create ${label.name} --color ${label.color} --description ${label.description} --force`
  }
  const live  = await $`gh label list --json name --jq .[].name --limit 1000`.text()
  const names = declared.labelNames
  live.split('\n')
    .filter(name => name && !names.has(name))
    .forEach(name => console.log(`${name} is live on GitHub and missing from ${repository.FILES.labels}`))
}

const rulesets = async (declared: repository.Repository) => {
  const settings: Settings = await repository.parseFile(repository.FILES.settings)
  const live: Live[]       = await $`gh api ${`${REPOSITORY}/rulesets`}`.json()
  for (const request of [...requestsOf(settings), ...rulesetRequestsOf(live, declared.rulesets)]) {
    await send(request)
  }
  unnamedOf(live, declared.rulesets).forEach(line => console.log(line))
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
 * off takes a `DELETE`.
 */
export const requestsOf = (
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
  ...Object.entries(settings.toggles)
    .map(([toggle, on]): Request => ({ method: on ? 'PUT' : 'DELETE', path: `${REPOSITORY}/${toggle}` }))
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

if (import.meta.main) {
  const declared = await repository.Repository.read()
  await (process.argv[2] === 'labels' ? labels(declared) : rulesets(declared))
}
