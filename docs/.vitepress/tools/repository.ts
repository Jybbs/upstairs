import { $, Glob, TOML, YAML }              from 'bun'
import { basename, dirname, extname, join } from 'node:path'

import { Lexer, Parser }       from '@actions/expressions'
import { Logical }             from '@actions/expressions/ast'
import { TokenType }           from '@actions/expressions/lexer'
import { differenceEuclidean } from 'culori'

interface Category {
  labels : string[]
  title  : string
}

interface Job {
  if?       : string
  name?     : string
  needs?    : string | string[]
  steps?    : Step[]
  strategy? : { matrix?: { include?: Row[] } }
}

interface MiseTask {
  aliases : string[]
  name    : string
}

export interface RegistryLabel {
  color       : string
  description : string
  name        : string
}

interface Row {
  name  : string
  tools : string
  task? : string
}

export interface Ruleset {
  name  : string
  rules : { parameters?: { required_status_checks?: { context: string }[] }, type: string }[]
}

interface Step {
  run?  : string
  uses? : string
  with? : { cache?: string, save?: string, tools?: string }
}

interface Template {
  labels : string[]
  path   : string
}

export interface Workflow {
  jobs         : Record<string, Job>
  on           : Record<string, (Record<string, unknown> & { types?: string[] }) | null>
  path         : string
  concurrency? : string | { group: string }
}

/**
 * The path of each declaration the repository tools read from a single file,
 * where `Repository.read` reads `guide`, `labels`, `manifest`, `release`, and
 * `sweep`, `sync.ts` reads `settings`, and `toolProblems` matches `warm` as the
 * end of a workflow's path.
 */
export const FILES = {
  guide    : '.github/CONTRIBUTING.md',
  labels   : '.github/labels.toml',
  manifest : 'docs/package.json',
  release  : '.github/release.yml',
  settings : '.github/settings.toml',
  sweep    : '.mise/tasks/repo/ci.toml',
  warm     : '.github/workflows/warm.yml'
}
const DRAFT_GROUP   = '${{ github.event.pull_request.draft }}'
const EXACT         = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/
const EXPRESSION    = /^\$\{\{ (.*) \}\}$/s
const FRONTMATTER   = /^---\n([\s\S]*?)\n---\n/
const KEYS          = 'color, description, name'
const LABEL_GAP     = 15
const LABEL_LENGTH  = 100
const MAIN          = "github.ref == 'refs/heads/main'"
const MATRIX_TOOLS  = '${{ matrix.tools }}'
const PIN           = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/
const PINNED        = ['dependencies', 'devDependencies', 'overrides'] as const
const PROVISION     = '/.github/actions/provision'
const READY         = '!github.event.pull_request.draft'
const READY_TYPE    = 'ready_for_review'
const ROW_KEYS      = new Set(['name', 'task', 'tools'])
const TASK_RUN      = /\bmise run (\w[\w:-]*)/g
const colorDistance = differenceEuclidean('oklab')
const statuses      = ['always', 'cancelled', 'failure', 'success']
  .map(name => ({ maxArgs: 0, minArgs: 0, name }))
/**
 * The one condition each job that publishes runs under, by the workflow holding
 * it and the job's name.
 */
const GUARDS = {
  '.github/workflows/draft.yml'  : { '🏷️ Cut': MAIN },
  '.github/workflows/deploy.yml' : {
    '🌐 Site'    : `(${MAIN} || (github.event_name == 'pull_request' && github.head_ref != 'main' `
                 + `&& github.event.pull_request.head.repo.full_name == github.repository)) && ${READY}`,
    '📡 Catalog' : `${MAIN} && ${READY}`
  }
}
/**
 * The parser for each extension `parseFile` reads, a Markdown file yielding
 * its YAML frontmatter.
 */
const PARSERS = {
  '.json' : JSON.parse,
  '.md'   : (text: string) => YAML.parse(FRONTMATTER.exec(text)?.[1] ?? '{}'),
  '.toml' : TOML.parse,
  '.yml'  : YAML.parse
}

/**
 * Parses `condition`, unwrapped from a `${{ }}` spanning all of it, as GitHub's
 * expression parser reads a job's `if`, throwing where it cannot.
 */
const conditionOf = (condition: string) => new Parser(
  new Lexer(condition.replace(EXPRESSION, '$1')).lex().tokens, ['github', 'inputs', 'needs', 'vars'], statuses
).parse()

/**
 * Whether `condition` is `READY`, or a chain of `&&` whose last operand is
 * `READY`, where an `||` outside a grouping breaks the chain. A condition that
 * fails to parse counts as neither.
 */
const endsReady = (condition = '') => {
  try {
    const tree = conditionOf(condition)
    const last = tree instanceof Logical && tree.operator.type === TokenType.AND ? tree.args.at(-1) : tree
    return shapeOf(last) === shapeOf(conditionOf(READY))
  } catch {
    return false
  }
}

const gatesOf = (workflow: Workflow) => Object.entries(workflow.jobs)
  .filter(([id, job]) => Object.keys(workflow.jobs)
    .every(other => other === id || [job.needs].flat().includes(other)))
  .map(([id, job]) => job.name ?? id)

const jobsOf = (workflows: Workflow[]) => workflows
  .flatMap(workflow => Object.values(workflow.jobs).map(job => ({ job, path: workflow.path })))

/**
 * Lists each package and the version `manifest` sets it to, across every
 * `PINNED` section the manifest holds.
 */
export const packagesOf = (manifest: Partial<Record<(typeof PINNED)[number], Record<string, string>>>) =>
  PINNED.flatMap(section => Object.entries(manifest[section] ?? {}))

const pathsOf = async (root: string, pattern: string) =>
  (await Array.fromAsync(new Glob(pattern).scan(root))).sort().map(path => join(root, path))

/**
 * Lists the tool set each provision step of `job` installs, one entry per
 * matrix row where the step reads the row's tools, beside the inputs it passes.
 */
const provisionsOf = (job: Job) => (job.steps ?? [])
  .filter(step => step.uses?.endsWith(PROVISION))
  .flatMap(({ with: inputs = {} }) =>
    (inputs.tools === MATRIX_TOOLS ? rowsOf(job).map(row => row.tools) : [inputs.tools])
      .map(tools => ({ ...inputs, tools })))

const rowsOf = (job: Job) => job.strategy?.matrix?.include ?? []

/**
 * The parse tree of `expr` without the source positions of its tokens, so two
 * trees read from text that differs only in its spacing compare equal.
 */
const shapeOf = (expr: unknown) => JSON.stringify(expr, (key, value) => key === 'range' ? undefined : value)

/**
 * Parses the JSON, TOML, or YAML file at `path`, or the frontmatter of the
 * Markdown file there, choosing the parser by its extension.
 */
export const parseFile = async (path: string) =>
  PARSERS[extname(path) as keyof typeof PARSERS](await Bun.file(path).text())

/**
 * The word a label's name ends on, after its emoji.
 */
export const wordOf = (name: string) => name.split(' ').at(-1) ?? ''

/**
 * Holds the declarations under `.github/` and `.mise/` that name one another,
 * meaning the label registry, the release categories, the issue templates, the
 * contributor guide, the site's manifest, the workflows and the action
 * manifests, the rulesets, the tasks, and the task the local sweep runs. It
 * reports where two of them disagree, where a label, a package, an action, a
 * matrix row, or a workflow breaks a rule of its own, where a publishing job is
 * missing or runs under another condition, and where a draft pull request runs
 * a job.
 */
export class Repository {
  constructor(
    readonly actions    : Workflow[],
    readonly categories : Category[],
    readonly guide      : string,
    readonly labels     : RegistryLabel[],
    readonly packages   : [string, string][],
    readonly rulesets   : Ruleset[],
    readonly sweep      : string[],
    readonly tasks      : string[],
    readonly templates  : Template[],
    readonly workflows  : Workflow[]
  ) {}

  /**
   * Reads every declaration from the repository rooted at `root`.
   */
  static async read(root = '.'): Promise<Repository> {
    const at = (path: string) => join(root, path)
    return new Repository(
      await Promise.all((await pathsOf(root, '.github/actions/*/action.yml')).map(async path =>
        ({ jobs: { [basename(dirname(path))]: (await parseFile(path)).runs }, on: {}, path }))),
      (await parseFile(at(FILES.release))).changelog.categories,
      await Bun.file(at(FILES.guide)).text(),
      (await parseFile(at(FILES.labels))).labels,
      packagesOf(await parseFile(at(FILES.manifest))),
      await Promise.all((await pathsOf(root, '.github/rulesets/*.json')).map(parseFile)),
      (await parseFile(at(FILES.sweep)))['repo:ci'].depends,
      (await $`mise tasks ls --hidden --json --no-global`.cwd(root).json() as MiseTask[])
        .flatMap(task => [task.name, ...task.aliases]),
      await Promise.all((await pathsOf(root, '.github/ISSUE_TEMPLATE/*.{md,yml}'))
        .filter(path => !path.endsWith('config.yml'))
        .map(async path => ({ labels: (await parseFile(path)).labels ?? [], path }))),
      await Promise.all((await pathsOf(root, '.github/workflows/*.yml'))
        .map(async path => ({ ...await parseFile(path), path })))
    )
  }

  /**
   * The distinct names of the jobs each check workflow ends on, meaning the
   * job whose `needs` lists every other job of its workflow.
   */
  get gates(): string[] {
    return [...new Set(this.checks.flatMap(gatesOf))]
  }

  /**
   * The name of every label the registry declares.
   */
  get labelNames(): Set<string> {
    return new Set(this.labels.map(label => label.name))
  }

  /**
   * Every failure the audit finds, one sentence each, meaning:
   *
   * - A release category, an issue template, or the guide disagreeing with the
   *   label registry, or the guide missing a gate or a row beside its task
   * - A ruleset requiring a check other than a gate, or `repo:ci` and the rows
   *   running different tasks
   * - A workflow or an action running a task `.mise/tasks/` does not declare,
   *   or a job restoring a tool set no `🛰️ Warm` row saves
   * - A label breaking the registry's form, or sharing a name or a near color
   *   with another
   * - An action from outside the repository naming no full commit or two
   *   different ones
   * - A package `docs/package.json` sets to a range rather than one exact
   *   version
   * - A matrix row holding a key other than `name`, `task`, and `tools`
   * - A workflow ending on no job that needs every other job
   * - A workflow a `pull_request` triggers leaving `ready_for_review` out of its
   *   activity types, holding a job whose condition does not end on the draft
   *   check, or sharing a concurrency group between a draft run and a ready one
   * - A `GUARDS` job missing or running under another condition
   */
  get problems(): string[] {
    return [
      ...this.categoryProblems, ...this.draftProblems, ...this.endingProblems, ...this.gateProblems,
      ...this.guardProblems, ...this.guideProblems, ...this.labelProblems, ...this.packageProblems,
      ...this.pinProblems, ...this.rowProblems, ...this.sweepProblems, ...this.taskProblems,
      ...this.templateProblems, ...this.toolProblems
    ]
  }

  /**
   * The rows of every matrix the check workflows run.
   */
  get rows(): Row[] {
    return jobsOf(this.checks).flatMap(({ job }) => rowsOf(job))
  }

  private get categoryProblems(): string[] {
    const names = this.labelNames
    const named = this.categories.flatMap(category => category.labels).filter(name => name !== '*')
    return [
      ...named
        .filter(name => !names.has(name))
        .map(name => `${FILES.release} names ${name}, which ${FILES.labels} lacks`),
      ...[...names]
        .map(name => ({ count: named.filter(other => other === name).length, name }))
        .filter(({ count }) => count !== 1)
        .map(({ count, name }) => `${name} sits in ${count} release categories rather than one`)
    ]
  }

  /**
   * The workflows every pull request runs, meaning those a `pull_request`
   * triggers with no path filter.
   */
  private get checks(): Workflow[] {
    return this.pulls.filter(({ on }) =>
      !['paths', 'paths-ignore'].some(key => key in (on.pull_request ?? {})))
  }

  /**
   * Each workflow a `pull_request` triggers that leaves `ready_for_review` out
   * of its activity types, or whose concurrency group does not end on
   * `DRAFT_GROUP` and so holds a draft run beside a ready one, and each job of
   * such a workflow whose condition `endsReady` does not pass.
   */
  private get draftProblems(): string[] {
    return this.pulls.flatMap(({ concurrency, jobs, on, path }) => [
      ...on.pull_request?.types?.includes(READY_TYPE)
        ? []
        : [`${path} runs on pull_request without the activity type ${READY_TYPE}`],
      ...(typeof concurrency === 'object' ? concurrency.group : concurrency)?.endsWith(DRAFT_GROUP) ?? true
        ? []
        : [  `${path} lets a draft run cancel a run in progress, `
           + `its concurrency group not ending on ${DRAFT_GROUP}`],
      ...Object.entries(jobs)
        .filter(([, job]) => !endsReady(job.if))
        .map(([id]) =>
          `${path} runs its ${id} job on a draft pull request, its condition not ending on ${READY}`)
    ])
  }

  private get endingProblems(): string[] {
    return this.workflows
      .filter(workflow => gatesOf(workflow).length === 0)
      .map(workflow => `${workflow.path} ends on no job whose needs list every other job`)
  }

  private get gateProblems(): string[] {
    const gates    = new Set(this.gates)
    const required = this.rulesets.flatMap(ruleset => ruleset.rules
      .flatMap(rule => rule.parameters?.required_status_checks ?? [])
      .map(check => check.context))
    return required
      .filter(context => !gates.has(context))
      .map(context => `A ruleset requires ${context}, which no workflow every pull request runs ends on`)
  }

  /**
   * Each job `GUARDS` names that is missing from its workflow, and each job of
   * that name running under a condition other than the one `GUARDS` gives it.
   */
  private get guardProblems(): string[] {
    const jobs = jobsOf(this.workflows)
    return Object.entries(GUARDS).flatMap(([file, guards]) => Object.entries(guards)
      .flatMap(([name, guard]) => {
        const named = jobs.filter(found => found.path.endsWith(file) && found.job.name === name)
        if (!named.length) return [`${file} holds no ${name} job`]
        return named
          .filter(({ job }) => job.if !== guard)
          .map(({ job }) => `${file} runs ${name} under ${job.if ?? 'no condition'} rather than ${guard}`)
      }))
  }

  private get guideProblems(): string[] {
    const lines = this.guide.split('\n')
    return [
      ...this.gates
        .filter(gate => !lines.some(line => line.includes(`\`${gate}\``)))
        .map(gate => `${FILES.guide} names no ${gate} gate`),
      ...this.labels
        .filter(label => !lines.some(line => line.includes(`\`${label.name}\``)))
        .map(label => `${FILES.guide} lists no ${label.name} label`),
      ...this.rows
        .filter(row => !lines.some(line =>
          line.includes(`\`${row.name}\``) && line.includes(`\`mise run ${row.task}\``)))
        .map(row => `${FILES.guide} lists no ${row.name} row running mise run ${row.task}`)
    ]
  }

  private get labelProblems(): string[] {
    const words = this.labels.map(label => wordOf(label.name))
    return [
      ...this.labels
        .map(label => ({ keys: Object.keys(label).sort().join(', '), name: label.name }))
        .filter(({ keys }) => keys !== KEYS)
        .map(({ keys, name }) => `${name} carries the keys ${keys} rather than ${KEYS}`),
      ...this.labels
        .filter(label => !/^[0-9a-f]{6}$/.test(label.color))
        .map(label => `${label.name} has the color ${label.color}`),
      ...this.labels
        .filter(label => label.description.length > LABEL_LENGTH || label.description.endsWith('.'))
        .map(label =>
          `${label.name} has a description past ${LABEL_LENGTH} characters or ending on a period`),
      ...this.labels.flatMap((label, index) => this.labels.slice(index + 1)
        .filter(other =>
          other.name === label.name || colorDistance(`#${label.color}`, `#${other.color}`) * 100 < LABEL_GAP)
        .map(other =>
          `${label.name} and ${other.name} share a name or sit under ${LABEL_GAP} apart in OKLab`)),
      ...words.join() === words.toSorted().join()
        ? []
        : [`${FILES.labels} lists its labels out of the alphabetical order of their words`]
    ]
  }

  /**
   * Every workflow and every action manifest.
   */
  private get manifests(): Workflow[] {
    return [...this.workflows, ...this.actions]
  }

  private get packageProblems(): string[] {
    return this.packages
      .filter(([, version]) => !EXACT.test(version))
      .map(([name, version]) => `${FILES.manifest} sets ${name} to ${version} rather than one exact version`)
  }

  private get pinProblems(): string[] {
    const uses = jobsOf(this.manifests).flatMap(({ job, path }) => (job.steps ?? [])
      .flatMap(step => step.uses?.startsWith('$/') === false ? [{ path, uses: step.uses }] : []))
    const pins = new Set(uses.map(({ uses }) => uses))
    return [
      ...uses
        .filter(({ uses }) => !PIN.test(uses))
        .map(({ path, uses }) => `${path} uses ${uses}, which names no full commit`),
      ...new Set([...pins]
        .map(pin => pin.split('@')[0])
        .filter((action, index, actions) => actions.indexOf(action) !== index)
        .map(action => `${action} is pinned to more than one commit`))
    ]
  }

  /**
   * Every workflow a `pull_request` triggers.
   */
  private get pulls(): Workflow[] {
    return this.workflows.filter(({ on }) => 'pull_request' in on)
  }

  /**
   * Each matrix row key outside `name`, `task`, and `tools`, which an unquoted
   * comma in a row's name splits off into a key of its own.
   */
  private get rowProblems(): string[] {
    return [...new Set(jobsOf(this.workflows).flatMap(({ job, path }) => rowsOf(job)
      .flatMap(row => Object.keys(row).filter(key => !ROW_KEYS.has(key)))
      .map(key => `${path} holds a matrix row with the key ${key}, which is not name, task, or tools`)))]
  }

  private get sweepProblems(): string[] {
    const tasks = this.rows.flatMap(row => row.task ?? [])
    return [
      ...tasks
        .filter(task => !this.sweep.includes(task))
        .map(task => `repo:ci does not depend on ${task}, which a row runs`),
      ...this.sweep
        .filter(task => !tasks.includes(task))
        .map(task => `repo:ci depends on ${task}, which no row runs`)
    ]
  }

  private get taskProblems(): string[] {
    const declared = new Set(this.tasks)
    return [...new Set(jobsOf(this.manifests)
      .flatMap(({ job, path }) => [
        ...(job.steps ?? [])
          .flatMap(step => Array.from(step.run?.matchAll(TASK_RUN) ?? [], match => match[1])),
        ...rowsOf(job).flatMap(row => row.task ?? [])
      ]
        .filter(task => !declared.has(task))
        .map(task => `${path} runs mise run ${task}, which .mise/tasks/ does not declare`)))]
  }

  private get templateProblems(): string[] {
    const names = this.labelNames
    return this.templates.flatMap(template => template.labels
      .filter(name => !names.has(name))
      .map(name => `${template.path} names ${name}, which ${FILES.labels} lacks`))
  }

  private get toolProblems(): string[] {
    const provisions = jobsOf(this.workflows)
      .flatMap(({ job, path }) => provisionsOf(job).map(provision => ({ ...provision, path })))
    const saved      = new Set(provisions
      .filter(({ path, save }) => path.endsWith(FILES.warm) && save === 'true')
      .map(({ tools }) => tools))
    return [...new Set(provisions
      .filter(({ cache, tools }) => cache !== 'false' && !saved.has(tools))
      .map(({ path, tools }) => `${path} restores the tools ${tools}, which no ${FILES.warm} row saves`))]
  }
}

if (import.meta.main) {
  const problems = (await Repository.read()).problems
  problems.forEach(problem => console.error(problem))
  process.exit(problems.length ? 1 : 0)
}
