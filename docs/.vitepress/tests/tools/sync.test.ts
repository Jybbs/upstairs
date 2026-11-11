import { describe, expect, it } from 'vitest'

import * as sync from '../../tools/sync.ts'

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
