import { basename, join } from 'node:path'
import { fileURLToPath }  from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import * as repository from '../../tools/repository.ts'

type Change = (base: repository.Repository) => Partial<repository.Repository>
type Job    = repository.Workflow['jobs'][string]

const CHECKOUT_PIN = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'
const PROVISION    = '$/.github/actions/provision'
const ROOT         = fileURLToPath(new URL('../../../..', import.meta.url))

let base: repository.Repository

const action = (uses: string) =>
  ({ actions: [{ jobs: { step: { steps: [{ uses }] } }, on: {}, path: 'action.yml' }] })

const job = (added: Job): Change => ({ workflows }) =>
  ({ workflows: [...workflows, { jobs: { added }, on: {}, path: 'added.yml' }] })

const relabel = (change: object, index: number): Change => ({ labels }) =>
  ({ labels: labels.with(index, { ...labels[index], ...change }) })

const variant = (change: Change): repository.Repository =>
  Object.assign(Object.create(repository.Repository.prototype), base, change(base))

beforeAll(async () => {
  base = await repository.Repository.read(ROOT)
})

describe('Repository', () => {
  it('reads the gate the ruleset requires and one row per check', () => {
    expect(base.gates).toEqual(['📓 Logbook'])
    expect(base.problems).toEqual([])
    expect(base.rows.map(row => row.task).sort()).toEqual([...base.sweep].sort())
  })

  it('reads the labels of each issue template, a Markdown one from its frontmatter', () =>
    expect(base.templates.map(({ labels, path }) => [basename(path), labels]))
      .toEqual([['bug.yml', ['🐞 bug']], ['spec.md', []]]))

  it.each<[string, string | string[]]>([['a string', 'a'], ['a list', ['a']]])(
    'names a gate with no name by its job id, reading needs as %s',
    (_, needs) => {
      const workflow = { jobs: { a: {}, gate: { needs } }, on: { pull_request: null }, path: 'ci.yml' }
      expect(variant(() => ({ workflows: [workflow] })).gates).toEqual(['gate'])
    }
  )

  it('reads each task by its name and its alias, from a task file and from a TOML table', () =>
    expect(base.tasks).toEqual(expect.arrayContaining(['audit', 'catalog:bundle', 'ci', 'repo:ci'])))

  it.each(['paths', 'paths-ignore'])(
    'leaves out of the checks a workflow whose pull_request trigger filters by %s',
    filter => {
      const workflow = {
        jobs : { a: {}, gate: { needs: 'a' } },
        on   : { pull_request: { [filter]: ['docs/**'] } },
        path : 'deploy.yml'
      }
      expect(variant(({ workflows }) => ({ workflows: [...workflows, workflow] })).gates)
        .toEqual(['📓 Logbook'])
    }
  )

  it.each<[string, Job]>([
    ['runs a task by its alias', { steps: [{ run: 'mise run audit' }] }],
    ['passes a flag and its value before the task', { steps: [{ run: 'mise run --jobs 4 site:test' }] }],
    [
      'runs the task its matrix row names',
      { strategy: { matrix: { include: [{ name: 'a', task: 'site:test', tools: 'bun' }] } } }
    ],
    [
      'installs tools it restores no cache for',
      { steps: [{ uses: PROVISION, with: { cache: 'false', tools: 'bun lychee' } }] }
    ],
    [
      'restores tools a Warm row saves',
      { steps: [{ uses: PROVISION, with: { tools: 'bun rust github:wasm-bindgen/wasm-bindgen' } }] }
    ]
  ])('reports nothing for a job that %s', (_, added) =>
    expect(variant(job(added)).problems).toEqual(base.problems))

  it('names a gate two pull-request workflows share once', () => {
    const workflow = (path: string) =>
      ({ jobs: { a: {}, gate: { needs: 'a' } }, on: { pull_request: null }, path })
    expect(variant(() => ({ workflows: [workflow('ci.yml'), workflow('deploy.yml')] })).gates)
      .toEqual(['gate'])
  })

  it.each<[string, Change, string]>([
    [
      'a label carrying an extra key',
      relabel({ extra: 1 }, 0),
      '🐞 bug carries the keys color, description, extra, name rather than color, description, name'
    ],
    ['a color in uppercase', relabel({ color: 'C62D42' }, 0), '🐞 bug has the color C62D42'],
    [
      'a description ending on a period',
      relabel({ description: 'A defect.' }, 0),
      '🐞 bug has a description past 100 characters or ending on a period'
    ],
    [
      'a description past 100 characters',
      relabel({ description: 'A defect'.padEnd(101, 's') }, 0),
      '🐞 bug has a description past 100 characters or ending on a period'
    ],
    [
      'two labels sharing a name',
      ({ labels }) => ({ labels: labels.toSpliced(1, 0, labels[0]) }),
      '🐞 bug and 🐞 bug share a name or sit under 15 apart in OKLab'
    ],
    [
      'two labels under 15 apart in OKLab',
      base => relabel({ color: base.labels[0].color }, 1)(base),
      '🐞 bug and 🗜️ build share a name or sit under 15 apart in OKLab'
    ],
    [
      'labels out of the order of their words',
      ({ labels }) => ({ labels: [labels[1], labels[0], ...labels.slice(2)] }),
      '.github/labels.toml lists its labels out of the alphabetical order of their words'
    ],
    [
      'a release category naming a label the registry lacks',
      ({ categories }) => ({ categories: [{ labels: ['🦄 unicorn'], title: 'Unicorns' }, ...categories] }),
      '.github/release.yml names 🦄 unicorn, which .github/labels.toml lacks'
    ],
    [
      'a label in no release category',
      ({ categories }) => ({
        categories: categories.filter(category => !category.labels.includes('🐞 bug'))
      }),
      '🐞 bug sits in 0 release categories rather than one'
    ],
    [
      'a template naming a label the registry lacks',
      () => ({ templates: [{ labels: ['🦄 unicorn'], path: 'bug.yml' }] }),
      'bug.yml names 🦄 unicorn, which .github/labels.toml lacks'
    ],
    [
      'a guide leaving the gate out',
      ({ guide }) => ({ guide: guide.replaceAll('`📓 Logbook`', '`🔭 Gate`') }),
      '.github/CONTRIBUTING.md names no 📓 Logbook gate'
    ],
    [
      'a guide leaving a label out',
      ({ guide }) => ({ guide: guide.replaceAll('`🐞 bug`', '') }),
      '.github/CONTRIBUTING.md lists no 🐞 bug label'
    ],
    [
      'a guide leaving a row out',
      ({ guide }) => ({ guide: guide.replace('`mise run site:press`', '') }),
      '.github/CONTRIBUTING.md lists no 📰 Press row running mise run site:press'
    ],
    [
      'a label in two release categories',
      ({ categories }) => ({ categories: [...categories, { labels: ['🐞 bug'], title: 'Again' }] }),
      '🐞 bug sits in 2 release categories rather than one'
    ],
    [
      'a guide naming a row by another name',
      ({ guide }) => ({ guide: guide.replace('`📰 Press`', '`📰 Pressed`') }),
      '.github/CONTRIBUTING.md lists no 📰 Press row running mise run site:press'
    ],
    [
      'a sweep missing a row',
      ({ sweep }) => ({ sweep: sweep.filter(task => task !== 'site:press') }),
      'repo:ci does not depend on site:press, which a row runs'
    ],
    [
      'a sweep running a task no row runs',
      ({ sweep }) => ({ sweep: [...sweep, 'site:test'] }),
      'repo:ci depends on site:test, which no row runs'
    ],
    [
      'a ruleset requiring a check no workflow ends on',
      ({ rulesets }) => ({
        rulesets: [...rulesets, {
          name  : 'gate',
          rules : [{
            parameters : { required_status_checks: [{ context: '🔭 Gate' }] },
            type       : 'required_status_checks'
          }]
        }]
      }),
      'A ruleset requires 🔭 Gate, which no workflow every pull request runs ends on'
    ],
    [
      'a workflow whose gate leaves a job out of its needs',
      ({ workflows }) => ({
        workflows: [
          ...workflows,
          { jobs: { a: {}, b: {}, gate: { needs: ['a'] } }, on: {}, path: 'deploy.yml' }
        ]
      }),
      'deploy.yml ends on no job whose needs list every other job'
    ],
    [
      'a step running a task .mise/tasks/ does not declare',
      job({ steps: [{ run: 'mise run site:tset' }] }),
      'added.yml runs mise run site:tset, which .mise/tasks/ does not declare'
    ],
    [
      'a task two steps of one job run once',
      job({ steps: [{ run: 'mise run site:tset' }, { run: 'mise run site:tset' }] }),
      'added.yml runs mise run site:tset, which .mise/tasks/ does not declare'
    ],
    [
      'an action running a task .mise/tasks/ does not declare',
      () => ({
        actions: [{ jobs: { step: { steps: [{ run: 'mise run site:tset' }] } }, on: {}, path: 'action.yml' }]
      }),
      'action.yml runs mise run site:tset, which .mise/tasks/ does not declare'
    ],
    [
      'a matrix row running a task .mise/tasks/ does not declare',
      job({ strategy: { matrix: { include: [{ name: 'a', task: 'site:tset', tools: 'bun' }] } } }),
      'added.yml runs mise run site:tset, which .mise/tasks/ does not declare'
    ],
    [
      'a job restoring tools no Warm row saves',
      job({ steps: [{ uses: PROVISION, with: { tools: 'bun lychee' } }] }),
      'added.yml restores the tools bun lychee, which no .github/workflows/warm.yml row saves'
    ],
    [
      'a job restoring the same tools twice once',
      job({ steps: Array(2).fill({ uses: PROVISION, with: { tools: 'bun lychee' } }) }),
      'added.yml restores the tools bun lychee, which no .github/workflows/warm.yml row saves'
    ],
    [
      'a job outside Warm saving the tools it restores',
      job({ steps: [{ uses: PROVISION, with: { save: 'true', tools: 'bun lychee' } }] }),
      'added.yml restores the tools bun lychee, which no .github/workflows/warm.yml row saves'
    ],
    [
      'a Warm job restoring tools no Warm row saves',
      ({ workflows }) => ({
        workflows: [...workflows, {
          jobs : { added: { steps: [{ uses: PROVISION, with: { tools: 'bun lychee' } }] } },
          on   : {},
          path : repository.FILES.warm
        }]
      }),
      '.github/workflows/warm.yml restores the tools bun lychee, which no .github/workflows/warm.yml row saves'
    ],
    [
      'a matrix row restoring tools no Warm row saves',
      job({
        steps    : [{ uses: PROVISION, with: { tools: '${{ matrix.tools }}' } }],
        strategy : { matrix: { include: [{ name: 'a', tools: 'bun lychee' }] } }
      }),
      'added.yml restores the tools bun lychee, which no .github/workflows/warm.yml row saves'
    ],
    [
      'an action pinned to a tag',
      () => action('octo/unpinned@v1'),
      'action.yml uses octo/unpinned@v1, which names no full commit'
    ],
    [
      'an action pinned to a short commit',
      () => action('octo/unpinned@3d3c42e'),
      'action.yml uses octo/unpinned@3d3c42e, which names no full commit'
    ],
    [
      'an action pinned to two commits',
      () => action(CHECKOUT_PIN.replace('3d3c', '0000')),
      'actions/checkout is pinned to more than one commit'
    ]
  ])('reports %s', (_, change, problem) =>
    expect(variant(change).problems.filter(found => !base.problems.includes(found))).toEqual([problem]))
})

describe('parseFile', () => {
  it.each([
    [
      'the frontmatter of a Markdown file',
      '.github/ISSUE_TEMPLATE/spec.md', { about: expect.any(String), name: 'Spec' }
    ],
    ['a Markdown file with no frontmatter as empty', repository.FILES.guide, {}]
  ])('reads %s', async (_, path, parsed) =>
    expect(await repository.parseFile(join(ROOT, path))).toEqual(parsed))
})
