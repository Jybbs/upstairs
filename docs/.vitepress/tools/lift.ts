import { glob, mkdtemp, mkdtempDisposable } from 'node:fs/promises'
import { tmpdir }                           from 'node:os'
import { join }                             from 'node:path'
import { parseArgs }                        from 'node:util'

import { $, TOML, semver } from 'bun'

import { FILE } from '../lib/orbit/catalog.ts'

type CargoManifest = Record<'dependencies' | 'dev-dependencies', Record<string, Requirement>>

interface Commits {
  current : string
  newest  : string
}

/**
 * One line of a crate's file in the sparse index, trimmed to the fields read.
 */
interface CrateRelease {
  vers   : string
  yanked : boolean
}

type Edit = (tree: string, pin: Pin) => Promise<void>

type MiseConfig = { tools: Record<string, Requirement> }

interface Ran {
  exitCode : number
  output   : string
}

type Read = (root: string, registries: Registries) => Promise<Pin[]>

/**
 * Reads the newest release of each pin a source declares.
 */
export interface Registries {
  action(repository: string, commit: string): Promise<{ commits: Commits, current: string, newest: string }>
  crate(name: string): Promise<string>
  pack(name: string, current: string): Promise<string>
  tool(name: string): Promise<string>
}

type Requirement = string | { version: string }

/**
 * Runs `command` in `cwd` under `env`, returning its exit status and its
 * output, standard error included.
 */
export type Run = (command: string[], cwd: string, env?: Record<string, string>) => Promise<Ran>

type Source = keyof typeof MANIFESTS

/**
 * The checks a trial runs in its copy of the tree once every lockfile is
 * resolved again, each run as `mise run <check>`.
 */
export const CHECKS = ['site:check', 'lock:check', 'crate:test']
/**
 * The edit writing a lifted pin into a tree, by the source declaring it.
 */
const EDITS = {
  actions: async (tree, { commits }) => {
    for (const path of await pathsOf(tree, MANIFESTS.actions)) {
      const text = await Bun.file(path).text()
      await Bun.write(path, text.replaceAll(`@${commits?.current}`, `@${commits?.newest}`))
    }
  },

  bun: async (tree, { current, name, newest }) => {
    const path     = join(tree, MANIFESTS.bun)
    const manifest = await Bun.file(path).json()
    for (const key of PACKAGE_KEYS) {
      if (manifest[key]?.[name] === current) manifest[key][name] = newest
    }
    await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`)
  },

  cargo: (tree, { current, name, newest }) =>
    editLine(join(tree, MANIFESTS.cargo), name, `=${current}`, `=${newest}`),

  mise: (tree, { current, name, newest }) => editLine(join(tree, MANIFESTS.mise), name, current, newest)
} satisfies Record<Source, Edit>
/**
 * The record of held pins, each a pin's name keyed to the reason it stays.
 */
export const HOLDS = '.mise/holds.toml'
/**
 * The pins two sources carry that move together, each set lifting to the
 * lowest of its members' newest versions and held whole where one member is.
 */
const LINKS = [['github:wasm-bindgen/wasm-bindgen', 'wasm-bindgen'], ['bun', '@types/bun']]
const MANIFESTS = {
  actions : ['.github/workflows/*.yml', '.github/actions/*/action.yml'],
  bun     : 'docs/package.json',
  cargo   : 'rust/Cargo.toml',
  mise    : '.mise/config.toml'
}
const PACKAGE_KEYS = ['dependencies', 'devDependencies', 'overrides'] as const
const PREPARE      = [['mise', 'lock'], ['mise', 'install'], ['mise', 'run', 'lock:sync']]
/**
 * The reader listing every pin a source declares beside its newest release.
 */
const READERS = {
  actions: async (root, registries) => {
    const uses = new Map<string, string>()
    for (const path of await pathsOf(root, MANIFESTS.actions)) {
      for (const [, name, commit] of (await Bun.file(path).text()).matchAll(USES)) uses.set(name, commit)
    }
    return Promise.all([...uses].map(async ([name, commit]) => {
      const { commits, current, newest } = await registries.action(name, commit)
      return new Pin('actions', name, current, newest, commits)
    }))
  },

  bun: async (root, registries) => {
    const manifest = await Bun.file(join(root, MANIFESTS.bun)).json()
    const pins     = new Map(PACKAGE_KEYS.flatMap(key => Object.entries<string>(manifest[key] ?? {})))
    return Promise.all([...pins].map(async ([name, current]) =>
      new Pin('bun', name, current, await registries.pack(name, current))))
  },

  cargo: async (root, registries) => {
    const manifest = await tomlOf<CargoManifest>(root, MANIFESTS.cargo)
    const pins     = Object.entries({ ...manifest.dependencies, ...manifest['dev-dependencies'] })
    return Promise.all(pins.map(async ([name, requirement]) =>
      new Pin('cargo', name, versionOf(requirement).replace(/^=/, ''), await registries.crate(name))))
  },

  mise: async (root, registries) => {
    const { tools } = await tomlOf<MiseConfig>(root, MANIFESTS.mise)
    return Promise.all(Object.entries(tools).map(async ([name, requirement]) =>
      new Pin('mise', name, versionOf(requirement), await registries.tool(name))))
  }
} satisfies Record<Source, Read>
/**
 * An action pinned by commit, as a workflow step's `uses` names it, capturing
 * the repository ahead of any path to an action inside it.
 */
const USES = /\b([\w.-]+\/[\w.-]+)(?:\/[\w.-]+)*@([0-9a-f]{40})\b/g
/**
 * The catalog file a trial copies into its tree, which no commit holds.
 */
const catalogFile = join('docs/public', FILE)

/**
 * Replaces `from` with `to`, each quoted, on the line of the TOML file at
 * `path` whose key is `key`, bare or quoted.
 */
const editLine = async (path: string, key: string, from: string, to: string) => {
  const lines = (await Bun.file(path).text()).split('\n')
  const index = lines.findIndex(line => [key, JSON.stringify(key)].includes(line.split('=')[0].trim()))
  lines[index] = lines[index].replace(`"${from}"`, `"${to}"`)
  await Bun.write(path, lines.join('\n'))
}

const fetched = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.text()
}

/**
 * Reads the holds `HOLDS` records in the tree at `root`, none where the file
 * is missing.
 */
const holdsOf = async (root: string): Promise<Record<string, string>> =>
  await Bun.file(join(root, HOLDS)).exists() ? tomlOf(root, HOLDS) : {}

/**
 * Runs `command` in `cwd`, returning its output, or throwing with that output
 * where it fails.
 */
const must = async (command: string[], cwd: string, run: Run) => {
  const { exitCode, output } = await run(command, cwd)
  if (exitCode) throw new Error(`${command.join(' ')} failed with ${output.trim()}`)
  return output
}

const pathsOf = async (root: string, patterns: string[]) =>
  (await Array.fromAsync(glob(patterns, { cwd: root }))).toSorted().map(path => join(root, path))

/**
 * Lays `lifts` out as one table naming each pin's source, current version,
 * newest version, and hold, adding the result of each lift's trial, or `held`,
 * where `results` is given.
 */
const tableOf = (lifts: Lift[], results?: Map<Lift, string[]>) => {
  const trial  = (lift: Lift, failures = results?.get(lift) ?? []) => lift.held
    ? 'held'
    : failures.length ? `fails ${failures.join(', ')}` : 'passes'
  const rows   = [
    ['SOURCE', 'PIN', 'CURRENT', 'NEWEST', 'HOLD', ...results ? ['TRIAL'] : []],
    ...lifts.flatMap(lift => lift.pins.map(pin => [
      pin.source, pin.name, pin.current, pin.newest, lift.hold ?? '', ...results ? [trial(lift)] : []
    ]))
  ]
  const widths = rows[0].map((_, column) => Math.max(...rows.map(row => row[column].length)))
  return rows
    .map(row => row.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd())
    .join('\n')
}

const tomlOf = async <T>(root: string, path: string) =>
  TOML.parse(await Bun.file(join(root, path)).text()) as T

/**
 * Lists each tracked file in the tree at `root` that differs from its last
 * commit, leaving out `HOLDS`, which no trial reads.
 */
const uncommitted = async (root: string, run: Run) => {
  const command = ['git', 'status', '--porcelain', '--untracked-files=no', '--', '.', `:!${HOLDS}`]
  const status  = await must(command, root, run)
  return status.split('\n').filter(Boolean).map(line => line.slice(3))
}

const versionOf = (requirement: Requirement) =>
  typeof requirement === 'string' ? requirement : requirement.version

/**
 * Runs the task for `args`, recording the hold `--hold <pin> <reason>` names,
 * then returning the table of every lift, with each unheld lift tried in a
 * scratch folder under `--try` and the passing ones written into `root` under
 * `--write`, each of the two refusing a tree whose tracked files differ from
 * its last commit.
 */
export const lift = async (
  args       : string[],
  root       : string,
  registries : Registries = new LiveRegistries(root),
  run        : Run        = shell
): Promise<string> => {
  const { positionals, values } = parseArgs({
    allowPositionals : true,
    args             : args,
    options          : { hold: { type: 'string' }, try: { type: 'boolean' }, write: { type: 'boolean' } }
  })
  const trying  = values.try || values.write
  const changed = trying ? await uncommitted(root, run) : []
  if (changed.length) {
    throw new Error(`--try and --write lift the last commit, refusing a change to ${changed.join(', ')}`)
  }
  const read  = await Pins.read(root, registries)
  const pins  = values.hold === undefined ? read : await read.hold(root, values.hold, positionals.join(' '))
  const lifts = pins.lifts
  const tried = lifts.filter(lift => !lift.held)
  if (!trying || !tried.length) return tableOf(lifts)
  await using scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-lift-'))
  return tableOf(lifts, await new Bench(root, scratch.path, run).results(tried, values.write))
}

/**
 * Runs `command` through Bun's shell, which passes each element as one
 * argument.
 */
export const shell: Run = async (command, cwd, env) => {
  const result = await $`${command}`.cwd(cwd).env(env ?? process.env).nothrow().quiet()
  return { exitCode: result.exitCode, output: `${result.stdout}${result.stderr}` }
}

/**
 * Copies the tree's last commit into a scratch folder for each trial, writes a
 * set of lifts into it, resolves every lockfile again, and runs `CHECKS`
 * there, with every tool mise and rustup install landing in that folder.
 */
export class Bench {
  constructor(readonly root: string, readonly scratch: string, readonly run: Run = shell) {}

  /**
   * The environment each command of a trial runs under, which drops every
   * variable an enclosing mise run set and points mise, rustup, and Cargo
   * at folders under `scratch`.
   */
  get env(): Record<string, string> {
    const kept = Object.entries(process.env)
      .filter((entry): entry is [string, string] => entry[1] !== undefined && !/^_*MISE_/.test(entry[0]))
    const home = (name: string) => join(this.scratch, 'homes', name)
    return {
      ...Object.fromEntries(kept),
      CARGO_HOME                : home('cargo'),
      MISE_CACHE_DIR            : home('mise-cache'),
      MISE_CONFIG_DIR           : home('mise-config'),
      MISE_DATA_DIR             : home('mise-data'),
      MISE_STATE_DIR            : home('mise-state'),
      MISE_TRUSTED_CONFIG_PATHS : this.scratch,
      RUSTUP_HOME               : home('rustup')
    }
  }

  /**
   * Tries `lifts` together and, where that fails, each on its own, returning
   * the steps and checks each lift fails, empty for a passing one. Under
   * `write`, the passing lifts land in `root` once a trial of them together
   * passes, as the files that trial changed.
   */
  async results(lifts: Lift[], write = false): Promise<Map<Lift, string[]>> {
    const together = await this.trial(lifts, write)
    if (!together.length || lifts.length === 1) return new Map(lifts.map(lift => [lift, together]))
    const results = new Map<Lift, string[]>()
    for (const lift of lifts) results.set(lift, await this.trial([lift]))
    const passing = lifts.filter(lift => !results.get(lift)?.length)
    if (write && passing.length) {
      const failures = await this.trial(passing, true)
      passing.forEach(lift => results.set(lift, failures.map(name => `${name} together`)))
    }
    return results
  }

  /**
   * Writes `lifts` into a fresh copy of the tree's last commit and runs each
   * step and check there, returning the name of each that fails and copying
   * the changed files into `root` under `write` where none does.
   */
  async trial(lifts: Lift[], write = false): Promise<string[]> {
    const tree = await mkdtemp(join(this.scratch, 'tree-'))
    await must(['git', 'worktree', 'add', '--detach', tree, 'HEAD'], this.root, this.run)
    try {
      const catalog = Bun.file(join(this.root, catalogFile))
      if (await catalog.exists()) await Bun.write(join(tree, catalogFile), catalog)
      for (const pin of lifts.flatMap(lift => lift.pins)) await pin.writeInto(tree)
      const failures = await this.failures(tree)
      if (write && !failures.length) await this.copyChanges(tree)
      return failures
    } finally {
      await must(['git', 'worktree', 'remove', '--force', tree], this.root, this.run)
    }
  }

  private async copyChanges(tree: string) {
    const changed = await must(['git', 'diff', '--name-only'], tree, this.run)
    for (const path of changed.split('\n').filter(Boolean)) {
      await Bun.write(join(this.root, path), Bun.file(join(tree, path)))
    }
  }

  /**
   * Runs the steps resolving every lockfile, stopping at the first that fails,
   * then every check, returning the name of each that fails.
   */
  private async failures(tree: string): Promise<string[]> {
    for (const step of PREPARE) {
      if (await this.fails(step, tree)) return [step.slice(1).join(' ')]
    }
    const failing = []
    for (const check of CHECKS) {
      if (await this.fails(['mise', 'run', check], tree)) failing.push(check)
    }
    return failing
  }

  /**
   * Runs `command` in `tree`, printing the last 40 lines of its output to
   * standard error where it fails.
   */
  private async fails(command: string[], tree: string) {
    const { exitCode, output } = await this.run(command, tree, this.env)
    if (exitCode) {
      const tail = output.split('\n').slice(-40).join('\n')
      console.error(`${command.join(' ')} failed in ${tree}\n${tail}`)
    }
    return exitCode !== 0
  }
}

/**
 * One move a lift makes, meaning a pin behind its newest release together with
 * each pin `LINKS` ties to it, and the reason a hold keeps them in place.
 */
class Lift {
  constructor(readonly pins: Pin[], readonly hold?: string) {}

  get held(): boolean {
    return this.hold !== undefined
  }
}

/**
 * Reads the newest releases from crates.io's sparse index, npm's dist-tags,
 * `mise latest`, and the GitHub REST API through `gh`.
 */
export class LiveRegistries implements Registries {
  constructor(readonly root: string, readonly run: Run = shell) {}

  /**
   * The tag naming the action's pinned commit, the most specific where
   * several do, and its latest release with that release's commit.
   */
  async action(repository: string, commit: string) {
    const newest  = await this.text(['gh', 'api', `repos/${repository}/releases/latest`, '--jq', '.tag_name'])
    const tagged  = await this.text(['gh', 'api', `repos/${repository}/commits/${newest}`, '--jq', '.sha'])
    const tags    = await this.text([
      'gh', 'api', '--paginate', `repos/${repository}/tags`,
      '--jq', `.[] | select(.commit.sha == "${commit}") | .name`
    ])
    const current = tags.split('\n').filter(Boolean).toSorted((one, other) => other.length - one.length)[0]
    return { commits: { current: commit, newest: tagged }, current: current ?? commit.slice(0, 7), newest }
  }

  /**
   * The highest release of the crate that is neither yanked nor a prerelease,
   * read from its file in the sparse index, whose path follows
   * https://doc.rust-lang.org/cargo/reference/registry-index.html#index-files.
   */
  async crate(name: string) {
    const lower    = name.toLowerCase()
    const prefix   = lower.length < 3 ? `${lower.length}` : lower.length === 3
      ? `3/${lower[0]}`
      : `${lower.slice(0, 2)}/${lower.slice(2, 4)}`
    const text     = await fetched(`https://index.crates.io/${prefix}/${lower}`)
    const releases = text.split('\n').filter(Boolean).map(line => JSON.parse(line) as CrateRelease)
    const newest   = releases
      .filter(release => !release.yanked && !release.vers.includes('-'))
      .map(release => release.vers)
      .toSorted(semver.order)
      .at(-1)
    if (newest === undefined) throw new Error(`${name} has no stable release on crates.io`)
    return newest
  }

  /**
   * The package's `latest` dist-tag, or for a prerelease pin the highest
   * version any dist-tag names.
   */
  async pack(name: string, current: string) {
    const tags    = JSON.parse(await fetched(`https://registry.npmjs.org/-/package/${name}/dist-tags`))
    const highest = Object.values<string>(tags).toSorted(semver.order).at(-1)
    return current.includes('-') && highest ? highest : tags.latest
  }

  async tool(name: string) {
    return this.text(['mise', 'latest', name])
  }

  private async text(command: string[]) {
    return (await must(command, this.root, this.run)).trim()
  }
}

/**
 * One pin a source declares, with the version it stands at and the newest
 * release of what it pins, where an action's versions are the tags naming its
 * pinned and newest commits.
 */
class Pin {
  constructor(
    readonly source   : Source,
    readonly name     : string,
    readonly current  : string,
    readonly newest   : string,
    readonly commits? : Commits
  ) {}

  /**
   * Whether the newest release stands past the pin, compared by commit for an
   * action and by version for every other source.
   */
  get behind(): boolean {
    return this.commits
      ? this.commits.newest !== this.commits.current
      : semver.order(this.newest, this.current) > 0
  }

  /**
   * The same pin with `version` as its newest release.
   */
  at(version: string): Pin {
    return new Pin(this.source, this.name, this.current, version, this.commits)
  }

  /**
   * Writes the pin's newest release into the manifest of the tree at `tree`,
   * leaving every lockfile as it stands.
   */
  async writeInto(tree: string) {
    await EDITS[this.source](tree, this)
  }
}

/**
 * Every pin the sources declare in one tree beside the holds recorded there.
 */
class Pins {
  constructor(
    readonly pins  : Pin[],
    readonly holds : Record<string, string>,
    readonly links : string[][] = LINKS
  ) {}

  /**
   * Reads every pin in the tree at `root`, asking `registries` for the newest
   * release of each, and the holds `HOLDS` records.
   */
  static async read(root: string, registries: Registries): Promise<Pins> {
    const pins = await Promise.all(Object.values(READERS).map(read => read(root, registries)))
    return new Pins(pins.flat(), await holdsOf(root))
  }

  /**
   * One lift per pin behind its newest release, a linked set lifting to the
   * lowest newest release among its members and carrying the hold of any of
   * them, in the order of the sources and then of the names.
   */
  get lifts(): Lift[] {
    const linked = (pin: Pin) => this.links.find(names => names.includes(pin.name)) ?? [pin.name]
    const seen   = new Set<string>()
    return this.pins
      .toSorted((one, other) => `${one.source} ${one.name}`.localeCompare(`${other.source} ${other.name}`))
      .flatMap(pin => {
        if (seen.has(pin.name)) return []
        const names   = linked(pin)
        const members = this.pins.filter(other => names.includes(other.name))
        members.forEach(member => seen.add(member.name))
        const version = members.map(member => member.newest).toSorted(semver.order)[0]
        const moved   = members.map(member => member.commits ? member : member.at(version))
        if (!moved.some(member => member.behind)) return []
        return [new Lift(moved, members.map(member => this.holds[member.name]).find(Boolean))]
      })
  }

  /**
   * Records `reason` as the hold on the pin named `name` in the tree at `root`,
   * replacing any earlier reason, and returns these pins with that hold.
   */
  async hold(root: string, name: string, reason: string): Promise<Pins> {
    if (!reason) throw new Error(`--hold ${name} takes a reason after the pin`)
    if (!this.pins.some(pin => pin.name === name)) throw new Error(`--hold ${name} names no pin`)
    const holds = { ...this.holds, [name]: reason }
    await Bun.write(join(root, HOLDS), TOML.stringify(holds))
    return new Pins(this.pins, holds, this.links)
  }
}

if (import.meta.main) console.log(await lift(process.argv.slice(2), process.cwd()))
