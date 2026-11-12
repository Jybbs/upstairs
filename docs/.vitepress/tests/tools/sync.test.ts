import { STATUS_CODES } from 'node:http'

import { describe, expect, it } from 'vitest'

import * as repository from '../../tools/repository.ts'
import * as sync       from '../../tools/sync.ts'
import * as gh         from '../fixtures/gh.ts'

const ABOUT = {
  description : 'Shows the satellites.',
  homepage    : 'https://upstairs.fyi',
  keywords    : ['satellite']
}
const LABELS = [
  { color: '617692', description: 'The orbit calculation', name: '🌎 orbit' },
  { color: '303d32', description: 'The terrain map', name: '🗺️ map' }
]
const SETTINGS = {
  actions    : { enabled: true },
  pages      : { build_type: 'workflow' },
  repository : { has_wiki: false },
  toggles    : { pages: false, 'vulnerability-alerts': true },
  workflow   : { default_workflow_permissions: 'read' }
} satisfies sync.Settings

describe('LabelSync', () => {
  const [orbit, map] = LABELS
  const patch        = {
    body   : { color: orbit.color, description: orbit.description, new_name: orbit.name },
    method : 'PATCH'
  }

  it.each([
    ['updates the live label of the same name', '🌎 orbit', patch, 'labels/%F0%9F%8C%8E%20orbit'],
    [
      'renames the live label whose word the row shares',
      '🛰️ orbit', patch, 'labels/%F0%9F%9B%B0%EF%B8%8F%20orbit'
    ],
    [
      'creates a label where no live label names it or shares its word',
      '🛰️ orbits', { body: orbit, method: 'POST' }, 'labels'
    ]
  ])('%s', (_, live, request, path) =>
    expect(new sync.LabelSync([orbit], [live]).requests)
      .toEqual([{ ...request, path: `repos/{owner}/{repo}/${path}` }]))

  it('renames no live label the registry names on a row of its own', () =>
    expect(new sync.LabelSync([{ ...orbit, name: '🌎 map' }, map], [map.name]).requests[0].method)
      .toBe('POST'))

  it('reports each live label the registry neither names nor renames', () =>
    expect(new sync.LabelSync(LABELS, ['🗺️ map', '🛰️ orbit', '🧭 compass']).strays)
      .toEqual(['🧭 compass is live on GitHub and missing from .github/labels.toml']))
})

describe('requestsOf', () => {
  it('sends the About box with the repository settings and each table to its endpoint', () =>
    expect(sync.requestsOf(false, SETTINGS, ABOUT)).toEqual([
      {
        body   : { description: 'Shows the satellites.', has_wiki: false, homepage: 'upstairs.fyi' },
        method : 'PATCH',
        path   : 'repos/{owner}/{repo}'
      },
      { body: { names: ['satellite'] }, method: 'PUT', path: 'repos/{owner}/{repo}/topics' },
      { body: { enabled: true }, method: 'PUT', path: 'repos/{owner}/{repo}/actions/permissions' },
      {
        body   : { default_workflow_permissions: 'read' },
        method : 'PUT',
        path   : 'repos/{owner}/{repo}/actions/permissions/workflow'
      },
      { method: 'DELETE', path: 'repos/{owner}/{repo}/pages' },
      { method: 'PUT', path: 'repos/{owner}/{repo}/vulnerability-alerts' }
    ]))

  it.each([
    ['creates the Pages site where none exists', false, 'POST'],
    ['updates the Pages site where one exists', true, 'PUT']
  ])('%s', (_, site, method) =>
    expect(sync.requestsOf(site, { ...SETTINGS, toggles: { pages: true } }, ABOUT).at(-1))
      .toEqual({ body: SETTINGS.pages, method, path: 'repos/{owner}/{repo}/pages' }))
})

describe('rulesetRequestsOf', () => {
  const ruleset = { name: 'main branch protection', rules: [] }

  it.each([
    ['updates the live ruleset of the same name', [{ id: 7, name: ruleset.name }], 'PUT', 'rulesets/7'],
    ['creates a ruleset no live one names', [{ id: 7, name: 'release tag protection' }], 'POST', 'rulesets']
  ])('%s', (_, live, method, path) =>
    expect(sync.rulesetRequestsOf(live, [ruleset]))
      .toEqual([{ body: ruleset, method, path: `repos/{owner}/{repo}/${path}` }]))
})

describe('unnamedOf', () => {
  it('reports each live ruleset no file names', () =>
    expect(sync.unnamedOf(
      [{ id: 7, name: 'main branch protection' }, { id: 8, name: 'legacy protection' }],
      [{ name: 'main branch protection', rules: [] }]
    )).toEqual(['The live ruleset legacy protection has no file under .github/rulesets/']))
})

describe('sync.ts against a stand-in gh', async () => {
  const declared                = await repository.Repository.read(gh.ROOT)
  const settings: sync.Settings = await repository.parseFile(gh.SETTINGS)
  const live: gh.Remote         = {
    failures : {},
    labels   : declared.labels.map(label => label.name),
    rulesets : declared.rulesets.map((ruleset, index) => ({ id: index + 1, name: ruleset.name }))
  }

  it('renames a live label through one PATCH to its live name and creates no label beside it', async () => {
    const [renamed, ...kept] = declared.labels
    const names              = [`🧪 ${repository.wordOf(renamed.name)}`, ...kept.map(label => label.name)]
    expect((await gh.Run.of('labels', { ...live, labels: names })).requests)
      .toEqual(declared.labels.map(({ color, description, name }, index) => ({
        body   : { color, description, new_name: name },
        method : 'PATCH',
        path   : `repos/{owner}/{repo}/labels/${encodeURIComponent(names[index])}`
      })))
  })

  it.each([
    [
      'creates the Pages site through a POST where the probe finds none',
      { 'GET repos/{owner}/{repo}/pages': 404 }, 'POST'
    ],
    ['updates the Pages site through a PUT where the probe finds one', {}, 'PUT']
  ])('%s', async (_, failures, method) =>
    expect((await gh.Run.of('rulesets', { ...live, failures })).requests
      .find(request => request.path.endsWith('/pages')))
      .toEqual({ body: settings.pages, method, path: 'repos/{owner}/{repo}/pages' }))

  it('stops where the Pages probe fails with anything but a 404 and sends no Pages request', async () => {
    const run = await gh.Run.of('rulesets', { ...live, failures: { 'GET repos/{owner}/{repo}/pages': 500 } })
    expect([run.code, run.requests.some(request => request.path.endsWith('/pages')), run.stderr])
      .toEqual([1, false, expect.stringContaining('GET repos/{owner}/{repo}/pages failed with gh: ')])
  })

  it.each([
    ['a PUT answered with a 422', 'PUT repos/{owner}/{repo}/topics', 422],
    ['a PUT answered with a 404', 'PUT repos/{owner}/{repo}/topics', 404],
    ['a DELETE answered with a 422', 'DELETE repos/{owner}/{repo}/vulnerability-alerts', 422]
  ])('stops at %s and sends nothing after it', async (_, failed, status) => {
    const run     = await gh.Run.of('rulesets', { ...live, failures: { [failed]: status } })
    const message = `${failed} failed with gh: ${STATUS_CODES[status]} (HTTP ${status})`
    expect([run.code, run.requests.map(request => `${request.method} ${request.path}`).at(-1), run.stderr])
      .toEqual([1, failed, expect.stringContaining(message)])
  })

  it('passes a DELETE answered with a 404 and sends every request after it', async () => {
    const failures = { 'DELETE repos/{owner}/{repo}/vulnerability-alerts': 404 }
    const run      = await gh.Run.of('rulesets', { ...live, failures })
    const sent     = [
      ...sync.requestsOf(true, settings), ...sync.rulesetRequestsOf(live.rulesets, declared.rulesets)
    ].map(request => ({ body: {}, ...request }))
    expect([run.code, run.requests]).toEqual([0, sent])
  })

  it.each<['labels' | 'rulesets', Partial<gh.Remote>, string[]]>([
    [
      'labels',
      { labels: [...live.labels, '🧭 compass', '🪐 rings'] },
      [
        '🧭 compass is live on GitHub and missing from .github/labels.toml',
        '🪐 rings is live on GitHub and missing from .github/labels.toml'
      ]
    ],
    [
      'rulesets',
      { rulesets: [...live.rulesets, { id: 8, name: 'legacy rules' }, { id: 9, name: 'stale rules' }] },
      [
        'The live ruleset legacy rules has no file under .github/rulesets/',
        'The live ruleset stale rules has no file under .github/rulesets/'
      ]
    ]
  ])('sync.ts %s reports each undeclared live entry on a line of its own', async (task, changes, lines) =>
    expect((await gh.Run.of(task, { ...live, ...changes })).lines).toEqual(lines))
})
