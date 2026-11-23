import { basename, join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import manifest        from '../../../package.json' with { type: 'json' }
import * as repository from '../../tools/repository.ts'
import { ROOT }        from '../common/reads.ts'

type Change = (base: repository.Repository) => Partial<repository.Repository>
type Job    = repository.Workflow['jobs'][string]

const ACTIVITY      = ['opened', 'synchronize', 'reopened', 'ready_for_review']
const CHECKOUT_PIN  = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'
const CI            = '.github/workflows/ci.yml'
const DEPLOY        = '.github/workflows/deploy.yml'
const DRAFT         = '.github/workflows/draft.yml'
const DRAFT_GROUP   = '${{ github.event.pull_request.draft }}'
const HEAD_NOT_MAIN = " && github.head_ref != 'main'"
const MAIN          = "github.ref == 'refs/heads/main'"
const PROVISION     = '$/.github/actions/provision'
const READY         = '!github.event.pull_request.draft'
const SPLIT_ROW     = { Rust: null, name: '🔥 Bun', tools: 'bun' }
const TRIGGERS      = { push: { branches: ['main'] }, workflow_dispatch: null }
const CANCELS       = 'lets a draft run cancel a ready one, '
                    + `its concurrency group not ending on ${DRAFT_GROUP}`
const CATALOG       = `${MAIN} && ${READY}`
const SITE          = `(${MAIN} || (github.event_name == 'pull_request'${HEAD_NOT_MAIN} `
                    + `&& github.event.pull_request.head.repo.full_name == github.repository)) && ${READY}`

let base: repository.Repository

const action = (uses: string) =>
  ({ actions: [{ jobs: { step: { steps: [{ uses }] } }, on: {}, path: 'action.yml' }] })

const added = (jobs: Record<string, Job>, on: repository.Workflow['on'] = {}): Change => ({ workflows }) =>
  ({ workflows: [...workflows, { jobs, on, path: 'added.yml' }] })

const checked = (jobs: Record<string, Job>, types?: string[]) =>
  added(jobs, { pull_request: { paths: ['docs/**'], types } })

const job = (change: Job) => added({ added: change })

const refit = (file: string, fields: Partial<repository.Workflow>) =>
  rework(file, workflow => ({ ...workflow, ...fields }))

const rejob = (change: Job, file: string, id: string) => rework(file, workflow =>
  ({ ...workflow, jobs: { ...workflow.jobs, [id]: { ...workflow.jobs[id], ...change } } }))

const relabel = (change: object, index: number): Change => ({ labels }) =>
  ({ labels: labels.with(index, { ...labels[index], ...change }) })

const retrigger = (on: repository.Workflow['on']): [Change, string] =>
  [refit(DRAFT, { on }), `${DRAFT} runs on ${JSON.stringify(on)} rather than ${JSON.stringify(TRIGGERS)}`]

const rework = (file: string, change: (workflow: repository.Workflow) => repository.Workflow): Change =>
  ({ workflows }) =>
    ({ workflows: workflows.map(workflow => workflow.path.endsWith(file) ? change(workflow) : workflow) })

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

  it('reads each package of the manifest’s dependencies, devDependencies, and overrides', () =>
    expect(base.packages).toEqual([manifest.dependencies, manifest.devDependencies, manifest.overrides]
      .flatMap(Object.entries)))

  it('reads a manifest without overrides or devDependencies', () =>
    expect(repository.packagesOf({ dependencies: { vue: '3.5.45' } })).toEqual([['vue', '3.5.45']]))

  it.each(['~3.5.45', '>=3.5.45', '3.5', 'latest', 'npm:vue@3.5.45', '3.5.45+build.1'])(
    'reports a package at %s, which is no X.Y.Z version with an optional prerelease',
    version => expect(variant(() => ({ packages: [['vue', version]] })).problems)
      .toEqual([`docs/package.json sets vue to ${version} rather than one exact version`])
  )

  it.each(['3.5.45', '2.0.0-alpha.21', '1.0.0-rc.1', '1.0.0-alpha-1'])(
    'reports nothing for a package at %s',
    version => expect(variant(() => ({ packages: [['vue', version]] })).problems).toEqual([])
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

  it.each([
    READY, `\${{ ${READY} }}`, `always() && ${READY}`, `\${{ always() && ${READY} }}`,
    `\${{ always() &&\n  ${READY} }}`, `(${MAIN} || always()) && ${READY}`,
    `(success() || failure() || cancelled()) && ${READY}`,
    `inputs.a == vars.b && needs.c.result == 'success' && ${READY}`
  ])(
    'reports nothing for a pull_request job under %s',
    condition =>
      expect(variant(checked({ added: { if: condition } }, ACTIVITY)).problems).toEqual(base.problems)
  )

  it.each<[string, repository.Workflow['concurrency']]>([
    ['a group string ending on the draft flag', `ci-\${{ github.ref }}-${DRAFT_GROUP}`],
    ['a group under its key ending on the draft flag', { group: `\${{ github.workflow }}-${DRAFT_GROUP}` }],
    ['absent', undefined]
  ])(
    'reports nothing for a pull_request workflow whose concurrency is %s',
    (_, concurrency) =>
      expect(variant(refit(CI, { concurrency })).problems).toEqual(base.problems)
  )

  it('names a gate two pull-request workflows share once', () => {
    const workflow = (path: string) =>
      ({ jobs: { a: {}, gate: { needs: 'a' } }, on: { pull_request: null }, path })
    expect(variant(() => ({ workflows: [workflow('ci.yml'), workflow('deploy.yml')] })).gates)
      .toEqual(['gate'])
  })

  it('reports a second job of a guarded name that runs without the guard', () => {
    const again = rework(DRAFT, workflow =>
      ({ ...workflow, jobs: { ...workflow.jobs, again: { name: '🏷️ Cut' } } }))
    expect(variant(again).problems)
      .toContain(`${DRAFT} runs 🏷️ Cut under no condition rather than ${MAIN}`)
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
      'a matrix row whose unquoted name splits at a comma into a key of its own',
      job({ strategy: { matrix: { include: [SPLIT_ROW] } } }),
      'added.yml holds a matrix row with the key Rust, which is not name, task, or tools'
    ],
    [
      'a key two matrix rows share once',
      job({ strategy: { matrix: { include: Array(2).fill(SPLIT_ROW) } } }),
      'added.yml holds a matrix row with the key Rust, which is not name, task, or tools'
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
        '.github/workflows/warm.yml restores the tools bun lychee, '
      + 'which no .github/workflows/warm.yml row saves'
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
      'a publishing job with its guard removed',
      rejob({ if: undefined }, DRAFT, 'cut'),
      `${DRAFT} runs 🏷️ Cut under no condition rather than ${MAIN}`
    ],
    [
      'a publishing job whose guard widens past main',
      rejob({ if: `(${MAIN} || always()) && ${READY}` }, DEPLOY, 'catalog'),
      `${DEPLOY} runs 📡 Catalog under (${MAIN} || always()) && ${READY} rather than ${CATALOG}`
    ],
    [
      'a site guard letting a pull request from main run it',
      rejob({ if: SITE.replace(HEAD_NOT_MAIN, '') }, DEPLOY, 'site'),
      `${DEPLOY} runs 🌐 Site under ${SITE.replace(HEAD_NOT_MAIN, '')} rather than ${SITE}`
    ],
    [
      'a publishing job renamed out of the rule',
      rejob({ name: '🏷️ Tag' }, DRAFT, 'cut'),
      `${DRAFT} holds no 🏷️ Cut job`
    ],
    [
      'a publishing job moved to another workflow',
      refit(DRAFT, { path: 'moved.yml' }),
      `${DRAFT} holds no 🏷️ Cut job`
    ],
    ['a Draft push filtered by path', ...retrigger({ ...TRIGGERS, push: { ...TRIGGERS.push, paths: ['docs/**'] } })],
    ['a Draft workflow no longer run by hand', ...retrigger({ push: TRIGGERS.push })],
    ['a Draft workflow run on a push to any branch', ...retrigger({ ...TRIGGERS, push: null })],
    [
      'a pull_request trigger running the default activity types alone',
      checked({ added: { if: READY } }),
      'added.yml runs on pull_request without the activity type ready_for_review'
    ],
    [
      'a pull_request trigger listing activity types without ready_for_review',
      checked({ added: { if: READY } }, ACTIVITY.slice(0, 3)),
      'added.yml runs on pull_request without the activity type ready_for_review'
    ],
    [
      'a bare pull_request trigger, which runs the default activity types',
      refit(CI, { on: { pull_request: null } }),
      `${join(ROOT, CI)} runs on pull_request without the activity type ready_for_review`
    ],
    [
      'a pull_request job with no condition',
      checked({ added: {} }, ACTIVITY),
      `added.yml runs its added job on a draft pull request, its condition not ending on ${READY}`
    ],
    [
      'a pull_request gate running under always() alone',
      checked({ gate: { if: 'always()' } }, ACTIVITY),
      `added.yml runs its gate job on a draft pull request, its condition not ending on ${READY}`
    ],
    [
      'a pull_request job whose draft check another condition widens',
      checked({ added: { if: `${READY} || always()` } }, ACTIVITY),
      `added.yml runs its added job on a draft pull request, its condition not ending on ${READY}`
    ],
    [
      'a pull_request job whose expression wrapper leaves out its spaces',
      checked({ added: { if: `\${{${READY}}}` } }, ACTIVITY),
      `added.yml runs its added job on a draft pull request, its condition not ending on ${READY}`
    ],
    [
      'a pull_request job joining its draft check through an or',
      checked({ added: { if: `${MAIN} || ${READY}` } }, ACTIVITY),
      `added.yml runs its added job on a draft pull request, its condition not ending on ${READY}`
    ],
    [
      'a pull_request job whose draft check binds to the right of an or',
      checked({ added: { if: `always() || ${MAIN} && ${READY}` } }, ACTIVITY),
      `added.yml runs its added job on a draft pull request, its condition not ending on ${READY}`
    ],
    [
      'a pull_request job whose expression closes before its draft check',
      checked({ added: { if: `\${{ always() }} && ${READY}` } }, ACTIVITY),
      `added.yml runs its added job on a draft pull request, its condition not ending on ${READY}`
    ],
    [
      'a pull_request workflow whose concurrency group leaves out the draft flag',
      refit(CI, { concurrency: { group: '${{ github.ref }}' } }),
      `${join(ROOT, CI)} ${CANCELS}`
    ],
    [
      'a pull_request workflow whose concurrency group string leaves out the draft flag',
      refit(DEPLOY, { concurrency: 'deploy' }),
      `${join(ROOT, DEPLOY)} ${CANCELS}`
    ],
    [
      'a pull_request workflow whose concurrency group carries the draft flag before its ref',
      refit(CI, { concurrency: { group: `${DRAFT_GROUP}-\${{ github.ref }}` } }),
      `${join(ROOT, CI)} ${CANCELS}`
    ],
    [
      'a package at a range rather than one exact version',
      ({ packages }) => ({ packages: [...packages, ['vue', '^3.5.45']] }),
      'docs/package.json sets vue to ^3.5.45 rather than one exact version'
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
    ],
    [
      'settings turning immutable releases off',
      ({ toggles }) => ({ toggles: { ...toggles, 'immutable-releases': false } }),
      '.github/settings.toml leaves immutable-releases off'
    ],
    [
      'settings leaving immutable releases out',
      ({ toggles }) => ({
        toggles: Object.fromEntries(Object.entries(toggles).filter(([name]) => name !== 'immutable-releases'))
      }),
      '.github/settings.toml leaves immutable-releases off'
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
