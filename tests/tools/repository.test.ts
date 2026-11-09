import { beforeAll, describe, expect, it } from 'vitest'

import { Repository } from '../../tools/repository.ts'

type Change = (base: Repository) => Partial<Repository>

const CHECKOUT_PIN = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'

let base: Repository

const action = (uses: string) =>
  ({ actions: [{ jobs: { step: { steps: [{ uses }] } }, on: {}, path: 'action.yml' }] })

const relabel = (index: number, change: object): Change => ({ labels }) =>
  ({ labels: labels.with(index, { ...labels[index], ...change }) })

const variant = (change: Change): Repository =>
  Object.assign(Object.create(Repository.prototype), base, change(base))

beforeAll(async () => {
  base = await Repository.read()
})

describe('Repository', () => {
  it('reads the gate the ruleset requires and one row per check', () => {
    expect(base.gates).toEqual(['🔭 Brief'])
    expect(base.rows.map(row => row.task).sort()).toEqual([...base.sweep].sort())
  })

  it.each<[string, string | string[]]>([['a string', 'a'], ['a list', ['a']]])(
    'names a gate with no name by its job id, reading needs as %s',
    (_, needs) => {
      const workflow = { jobs: { a: {}, gate: { needs } }, on: { pull_request: null }, path: 'ci.yml' }
      expect(variant(() => ({ workflows: [workflow] })).gates).toEqual(['gate'])
    }
  )

  it.each<[string, Change, string]>([
    [
      'a label carrying an extra key',
      relabel(0, { extra: 1 }),
      '🐞 bug carries the keys color, description, extra, name rather than color, description, name'
    ],
    ['a color in uppercase', relabel(0, { color: 'C62D42' }), '🐞 bug has the color C62D42'],
    [
      'a description ending on a period',
      relabel(0, { description: 'A defect.' }),
      '🐞 bug has a description past 100 characters or ending on a period'
    ],
    [
      'a description past 100 characters',
      relabel(0, { description: 'A defect'.padEnd(101, 's') }),
      '🐞 bug has a description past 100 characters or ending on a period'
    ],
    [
      'two labels sharing a name',
      ({ labels }) => ({ labels: labels.toSpliced(1, 0, labels[0]) }),
      '🐞 bug and 🐞 bug share a name or sit under 15 apart in OKLab'
    ],
    [
      'two labels under 15 apart in OKLab',
      base => relabel(1, { color: base.labels[0].color })(base),
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
      ({ categories }) => ({ categories: categories.filter(category => !category.labels.includes('🐞 bug')) }),
      '🐞 bug sits in 0 release categories rather than one'
    ],
    [
      'a template naming a label the registry lacks',
      () => ({ templates: [{ labels: ['🦄 unicorn'], path: 'bug.yml' }] }),
      'bug.yml names 🦄 unicorn, which .github/labels.toml lacks'
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
      'A ruleset requires 🔭 Gate, which no pull-request workflow ends on'
    ],
    [
      'an action pinned to a tag',
      () => action('octo/unpinned@v1'),
      'action.yml uses octo/unpinned@v1, which names no full commit'
    ],
    [
      'an action pinned to two commits',
      () => action(CHECKOUT_PIN.replace('3d3c', '0000')),
      'actions/checkout is pinned to more than one commit'
    ]
  ])('reports %s', (_, change, problem) =>
    expect(variant(change).problems.filter(found => !base.problems.includes(found))).toEqual([problem]))
})
