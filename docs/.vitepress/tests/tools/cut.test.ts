import { describe, expect, it, vi } from 'vitest'

import { Draft, NOTES, outcomeOf } from '../../tools/cut.ts'

const SHA = '761cc15aaf0c1e2a3b4c5d6e7f8091a2b3c4d5e6'

const release = (tag_name: string, draft = false, id = 7) => ({ draft, id, tag_name })

describe('outcomeOf', () => {
  it.each([
    ['no release carries the version', [release('0.1.0')], 'create', [], 1],
    ['the repository holds no release', [], 'create', [], 1],
    ['the one release tags the version behind a v prefix', [release('v0.2.0')], 'create', [], 1],
    [
      'only a draft carries the version',
      [release('0.1.0', false, 3), release('0.2.0', true, 9)], 'refresh', [9], 0
    ],
    ['a published release carries the version', [release('0.2.0')], 'published', [], 0],
    [
      'a draft and a published release carry the version',
      [release('0.2.0', true), release('0.2.0')], 'published', [], 0
    ]
  ])('returns the outcome, creating or refreshing only the draft it names, where %s',
    async (_, releases, outcome, refreshed, created) => {
      const create  = vi.fn(async () => {})
      const refresh = vi.fn(async (_id: number) => {})
      expect(await outcomeOf(async () => releases, create, refresh, '0.2.0')).toBe(outcome)
      expect([create.mock.calls.length, refresh.mock.calls.map(([id]) => id)]).toEqual([created, refreshed])
    })

  it.each([
    ['the releases cannot be read', () => Promise.reject(new Error('HTTP 502')), async () => [], 'HTTP 502'],
    ['the draft cannot be created', async () => [], () => Promise.reject(new Error('HTTP 422')), 'HTTP 422'],
    [
      'the draft cannot be refreshed',
      async () => [release('0.2.0', true)], () => Promise.reject(new Error('HTTP 404')), 'HTTP 404'
    ]
  ])('fails where %s', (_, read, fail, message) =>
    expect(outcomeOf(read, fail, fail, '0.2.0')).rejects.toThrow(message))
})

describe('Draft', () => {
  const draft = Draft.from('0.2.0', { GITHUB_REPOSITORY: 'Jybbs/upstairs', GITHUB_SHA: SHA })

  it('reads the repository and the commit the draft targets', () =>
    expect({ ...draft }).toEqual({ repository: 'Jybbs/upstairs', target: SHA, version: '0.2.0' }))

  it('creates the version as a draft with generated notes, titled for it and targeting the commit', () =>
    expect(draft.createArgs).toEqual([
      'release', 'create', '0.2.0', '--draft', '--generate-notes',
      '--repo', 'Jybbs/upstairs', '--target', SHA, '--title', '0.2.0'
    ]))

  it('generates the notes of the version up to the commit', () =>
    expect(draft.notesArgs).toEqual([
      'api', '--method', 'POST', 'repos/Jybbs/upstairs/releases/generate-notes',
      '--raw-field', 'tag_name=0.2.0', '--raw-field', `target_commitish=${SHA}`
    ]))

  it('sets the draft’s notes as written and moves its target to the commit', () =>
    expect(draft.refreshArgs(9, '@notes')).toEqual([
      'api', '--method', 'PATCH', 'repos/Jybbs/upstairs/releases/9',
      '--raw-field', 'body=@notes', '--raw-field', `target_commitish=${SHA}`, '--silent'
    ]))
})

describe('NOTES', () => {
  it.each([
    ['create', '::notice::'],
    ['published', '::error::'],
    ['refresh', '::notice::']
  ] as const)('prints the %s outcome with the version, opening on %s', (outcome, opening) =>
    expect(NOTES[outcome]('0.2.0')).toMatch(new RegExp(`^${opening}.*0\\.2\\.0`)))

  it('names the bump command where a published release carries the version', () =>
    expect(NOTES.published('0.2.0')).toContain('mise bump'))
})
