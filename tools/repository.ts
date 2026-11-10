import { basename, dirname, extname, join } from 'node:path'

import { Glob, TOML, YAML }    from 'bun'
import { differenceEuclidean } from 'culori'

interface Category {
  labels : string[]
  title  : string
}

interface Job {
  needs?    : string | string[]
  name?     : string
  steps?    : Step[]
  strategy? : { matrix?: { include?: Row[] } }
}

interface RegistryLabel {
  color       : string
  description : string
  name        : string
}

interface Row {
  name  : string
  task  : string
  tools : string
}

export interface Ruleset {
  name  : string
  rules : { parameters?: { required_status_checks?: { context: string }[] }, type: string }[]
}

interface Step {
  uses? : string
}

interface Template {
  labels : string[]
  path   : string
}

export interface Workflow {
  jobs : Record<string, Job>
  on   : Record<string, unknown>
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
  sweep    : '.mise/tasks/repo/ci.toml'
}
const KEYS          = 'color, description, name'
const LABEL_GAP     = 15
const LABEL_LENGTH  = 100
const PARSERS       = { '.json': JSON.parse, '.toml': TOML.parse, '.yml': YAML.parse }
const PIN           = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/
const colorDistance = differenceEuclidean('oklab')

const pathsOf = async (root: string, pattern: string) =>
  (await Array.fromAsync(new Glob(pattern).scan(root))).sort().map(path => join(root, path))

const wordOf = (label: RegistryLabel) => label.name.split(' ').at(-1) ?? ''

/**
 * Parses the JSON, TOML, or YAML file at `path`, choosing the parser by its
 * extension.
 */
export const parseFile = async (path: string) =>
  PARSERS[extname(path) as keyof typeof PARSERS](await Bun.file(path).text())

/**
 * Holds the declarations under `.github/` and `.mise/` that name one another,
 * meaning the label registry, the release categories, the issue templates, the
 * contributor guide, the workflows and the action manifests, the rulesets, and
 * the task the local sweep runs, and reports each place two of them disagree.
 */
export class Repository {
  constructor(
    readonly actions    : Workflow[],
    readonly categories : Category[],
    readonly guide      : string,
    readonly labels     : RegistryLabel[],
    readonly rulesets   : Ruleset[],
    readonly sweep      : string[],
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
      await Promise.all((await pathsOf(root, '.github/ISSUE_TEMPLATE/*.yml'))
        .filter(path => !path.endsWith('config.yml'))
        .map(async path => ({ labels: (await parseFile(path)).labels ?? [], path }))),
      await Promise.all((await pathsOf(root, '.github/workflows/*.yml'))
        .map(async path => ({ ...await parseFile(path), path })))
    )
  }

  /**
   * The names of the jobs each pull-request workflow ends on, meaning the job
   * whose `needs` lists every other job of its workflow.
   */
  get gates(): string[] {
    return this.checks.flatMap(workflow => Object.entries(workflow.jobs)
      .filter(([id, job]) => Object.keys(workflow.jobs)
        .every(other => other === id || [job.needs].flat().includes(other)))
      .map(([id, job]) => job.name ?? id))
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
      ...this.categoryProblems, ...this.gateProblems, ...this.guideProblems, ...this.labelProblems,
      ...this.pinProblems, ...this.sweepProblems, ...this.templateProblems
    ]
  }

  /**
   * The rows of every matrix the pull-request workflows run.
   */
  get rows(): Row[] {
    return this.checks.flatMap(workflow => Object.values(workflow.jobs)
      .flatMap(job => job.strategy?.matrix?.include ?? []))
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

  private get checks(): Workflow[] {
    return this.workflows.filter(workflow => 'pull_request' in workflow.on)
  }

  private get gateProblems(): string[] {
    const gates    = new Set(this.gates)
    const required = this.rulesets.flatMap(ruleset => ruleset.rules
      .flatMap(rule => rule.parameters?.required_status_checks ?? [])
      .map(check => check.context))
    return required
      .filter(context => !gates.has(context))
      .map(context => `A ruleset requires ${context}, which no pull-request workflow ends on`)
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
    const words = this.labels.map(wordOf)
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

  private get pinProblems(): string[] {
    const uses = [...this.workflows, ...this.actions].flatMap(workflow => Object.values(workflow.jobs)
      .flatMap(job => job.steps ?? [])
      .flatMap(step =>
        step.uses?.startsWith('$/') === false ? [{ path: workflow.path, uses: step.uses }] : []))
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
    const tasks = this.rows.map(row => row.task)
    return [
      ...tasks
        .filter(task => !this.sweep.includes(task))
        .map(task => `repo:ci does not depend on ${task}, which a row runs`),
      ...this.sweep
        .filter(task => !tasks.includes(task))
        .map(task => `repo:ci depends on ${task}, which no row runs`)
    ]
  }

  private get templateProblems(): string[] {
    const names = this.labelNames
    return this.templates.flatMap(template => template.labels
      .filter(name => !names.has(name))
      .map(name => `${template.path} names ${name}, which ${FILES.labels} lacks`))
  }
}

if (import.meta.main) {
  const problems = (await Repository.read()).problems
  problems.forEach(problem => console.error(problem))
  process.exit(problems.length ? 1 : 0)
}
