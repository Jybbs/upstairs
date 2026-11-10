import { describe, expect, it } from 'vitest'

import { requestsOf, rulesetRequestsOf, type Settings, unnamedOf } from '../../tools/sync.ts'

const ABOUT    = {
  description : 'Shows the satellites.',
  homepage    : 'https://upstairs.fyi',
  keywords    : ['satellite']
}
const SETTINGS = {
  actions    : { enabled: true },
  repository : { has_wiki: false },
  toggles    : { pages: false, 'vulnerability-alerts': true },
  workflow   : { default_workflow_permissions: 'read' }
} satisfies Settings

describe('requestsOf', () => {
  it('sends the About box with the repository settings and each table to its endpoint', () =>
    expect(requestsOf(SETTINGS, ABOUT)).toEqual([
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
})

describe('rulesetRequestsOf', () => {
  const ruleset = { name: 'main branch protection', rules: [] }

  it.each([
    ['updates the live ruleset of the same name', [{ id: 7, name: ruleset.name }], 'PUT', 'rulesets/7'],
    ['creates a ruleset no live one names', [{ id: 7, name: 'release tag protection' }], 'POST', 'rulesets']
  ])('%s', (_, live, method, path) =>
    expect(rulesetRequestsOf(live, [ruleset]))
      .toEqual([{ body: ruleset, method, path: `repos/{owner}/{repo}/${path}` }]))
})

describe('unnamedOf', () => {
  it('reports each live ruleset no file names', () =>
    expect(unnamedOf(
      [{ id: 7, name: 'main branch protection' }, { id: 8, name: 'legacy protection' }],
      [{ name: 'main branch protection', rules: [] }]
    )).toEqual(['The live ruleset legacy protection has no file under .github/rulesets/']))
})
