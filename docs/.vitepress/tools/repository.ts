import { $, Glob, TOML, YAML }              from 'bun'
import { basename, dirname, extname, join } from 'node:path'

import { differenceEuclidean } from 'culori'

interface Category {
  labels : string[]
  title  : string
}

interface Job {
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
  jobs : Record<string, Job>
  on   : Record<string, Record<string, unknown> | null>
  path : string
}

/**
 * The path of each declaration `Repository.read` takes from a single file.
 */
export const FILES = {
  guide    : '.github/CONTRIBUTING.md',
  labels   : '.github/labels.toml',
  release  : '.github/release.yml',
  settings : '.github/settings.toml',
  sweep    : '.mise/tasks/repo/ci.toml',
  warm     : '.github/workflows/warm.yml'
}
const FRONTMATTER   = /^---\n([\s\S]*?)\n---\n/
const KEYS          = 'color, description, name'
const LABEL_GAP     = 15
const LABEL_LENGTH  = 100
const MATRIX_TOOLS  = '${{ matrix.tools }}'
const PIN           = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/
const PROVISION     = '/.github/actions/provision'
const TASK_RUN      = /\bmise run (\w[\w:-]*)/g
const colorDistance = differenceEuclidean('oklab')
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

const gatesOf = (workflow: Workflow) => Object.entries(workflow.jobs)
  .filter(([id, job]) => Object.keys(workflow.jobs)
    .every(other => other === id || [job.needs].flat().includes(other)))
  .map(([id, job]) => job.name ?? id)

const jobsOf = (workflows: Workflow[]) => workflows
  .flatMap(workflow => Object.values(workflow.jobs).map(job => ({ job, path: workflow.path })))

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
 * contributor guide, the workflows and the action manifests, the rulesets, the
 * tasks, and the task the local sweep runs, and reports each place two of them
 * disagree.
 */
export class Repository {
  constructor(
    readonly actions    : Workflow[],
    readonly categories : Category[],
    readonly guide      : string,
    readonly labels     : RegistryLabel[],
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
   * Every disagreement between the declarations, one sentence each.
   */
  get problems(): string[] {
    return [
      ...this.categoryProblems, ...this.endingProblems, ...this.gateProblems, ...this.guideProblems,
      ...this.labelProblems, ...this.pinProblems, ...this.sweepProblems, ...this.taskProblems,
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
    return this.workflows.filter(({ on }) =>
      'pull_request' in on && !['paths', 'paths-ignore'].some(key => key in (on.pull_request ?? {})))
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
