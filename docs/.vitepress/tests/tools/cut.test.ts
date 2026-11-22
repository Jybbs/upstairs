import { describe, expect, it, vi } from 'vitest'

import { CODES, Draft, NOTES, outcomeOf } from '../../tools/cut.ts'

const SHA = '761cc15aaf0c1e2a3b4c5d6e7f8091a2b3c4d5e6'

const release = (tag_name: string, draft = false, id = 7, name: string | null = tag_name) =>
  ({ draft, id, name, tag_name })

const untagged = (id: number, name: string | null = '0.2.0') =>
  release('untagged-2062677af4ac4d95b4d0', true, id, name)

describe('outcomeOf', () => {
  it.each([
    ['no release carries the version', [release('0.1.0')], 'create', [], 1],
    ['the repository holds no release', [], 'create', [], 1],
    ['the one release tags the version behind a v prefix', [release('v0.2.0')], 'create', [], 1],
    ['the one release tags a prerelease of the version', [release('0.2.0-rc.1')], 'create', [], 1],
    [
      'only a draft carries the version',
      [release('0.1.0', false, 3), release('0.2.0', true, 9)], 'refresh', [9], 0
    ],
    [
      'two drafts carry the version',
      [release('0.2.0', true, 4), release('0.2.0', true, 9)], 'refresh', [9], 0
    ],
    [
      'only an untagged draft titled for the version carries it',
      [release('0.1.0', false, 3), untagged(9)], 'refresh', [9], 0
    ],
    [
      'three untagged drafts titled for the version carry it, the newest listed between the others',
      [untagged(5), untagged(9), untagged(4)], 'refresh', [9], 0
    ],
    [
      'a tagged draft and older untagged drafts titled for the version carry it',
      [untagged(4), release('0.2.0', true, 9), untagged(5)], 'refresh', [9], 0
    ],
    [
      'an untagged draft titled for the version is newer than the draft tagging it',
      [release('0.2.0', true, 4), untagged(9)], 'refresh', [9], 0
    ],
    [
      'the one draft tags the version under another title',
      [release('0.2.0', true, 9, 'Next')], 'refresh', [9], 0
    ],
    [
      'the one draft is titled for the version but tags another',
      [release('0.1.9', true, 9, '0.2.0')], 'refresh', [9], 0
    ],
    ['the one untagged draft carries another title', [untagged(9, '0.1.9')], 'create', [], 1],
    ['the one untagged draft carries no title', [untagged(9, null)], 'create', [], 1],
    [
      'the one untagged draft is titled for the version behind a v prefix',
      [untagged(9, 'v0.2.0')], 'create', [], 1
    ],
    [
      'the one untagged draft is titled for a prerelease of the version',
      [untagged(9, '0.2.0-rc.1')], 'create', [], 1
    ],
    [
      'a published release titled for the version tags another',
      [release('0.1.0', false, 3, '0.2.0')], 'create', [], 1
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

  it.each([
    [
      'reads the repository and the commit the draft targets',
      { ...draft }, { repository: 'Jybbs/upstairs', target: SHA, version: '0.2.0' }
    ],
    [
      'creates the version as a draft with generated notes, titled for it and targeting the commit',
      draft.createArgs, [
        'release', 'create', '0.2.0', '--draft', '--generate-notes',
        '--repo', 'Jybbs/upstairs', '--target', SHA, '--title', '0.2.0'
      ]
    ],
    [
      'generates the notes of the version up to the commit',
      draft.notesArgs, [
        'api', '--method', 'POST', 'repos/Jybbs/upstairs/releases/generate-notes',
        '--raw-field', 'tag_name=0.2.0', '--raw-field', `target_commitish=${SHA}`
      ]
    ],
    [
      'sets the draft’s notes as written, keeps its tag on the version, and moves its target to the commit',
      draft.refreshArgs(9, '@notes'), [
        'api', '--method', 'PATCH', 'repos/Jybbs/upstairs/releases/9',
        '--raw-field', 'body=@notes', '--raw-field', 'tag_name=0.2.0',
        '--raw-field', `target_commitish=${SHA}`, '--silent'
      ]
    ]
  ])('%s', (_, actual, expected) => expect(actual).toEqual(expected))

  it('sends the notes GitHub generates for the version to the draft', async () => {
    const notes = vi.fn(async (_args: string[]) => ({ body: '@notes' }))
    const send  = vi.fn(async (_args: string[]) => {})
    await draft.refresh(9, notes, send)
    expect([notes.mock.calls, send.mock.calls])
      .toEqual([[[draft.notesArgs]], [[draft.refreshArgs(9, '@notes')]]])
  })

  it('leaves one draft of the version, tagged for it, once a second cut refreshes the first one’s draft',
    async () => {
      const releases: ReturnType<typeof release>[] = []
      const create = async () => releases.push(untagged(releases.length + 1))
      const send   = async (args: string[]) => {
        const stored = releases.find(({ id }) => args[3] === `repos/Jybbs/upstairs/releases/${id}`)
        if (!stored) throw new Error(`HTTP 404 for ${args[3]}`)
        Object.assign(stored, Object.fromEntries(
          args.flatMap((arg, i) => args[i - 1] === '--raw-field' ? [arg.split(/=(.*)/s, 2)] : [])))
      }
      const cut = () => outcomeOf(async () => structuredClone(releases), create,
        id => draft.refresh(id, async () => ({ body: '@notes' }), send), '0.2.0')
      expect([await cut(), await cut(), releases]).toEqual(['create', 'refresh', [{
        body : '@notes', draft : true, id : 1, name : '0.2.0', tag_name : '0.2.0', target_commitish : SHA
      }]])
    })
})

describe('CODES', () => {
  it.each([['create', 0], ['published', 1], ['refresh', 0]] as const)('ends the %s outcome on status %i',
    (outcome, code) => expect(CODES[outcome]).toBe(code))
})

describe('NOTES', () => {
  it.each([
    ['create', '::notice::'],
    ['published', '::error::'],
    ['refresh', '::notice::']
  ] as const)('prints the %s outcome with the version, opening on %s', (outcome, opening) =>
    expect(NOTES[outcome]('0.2.0')).toMatch(new RegExp(`^${opening}.*0\\.2\\.0`)))

  it.each(['mise bump', 'docs/package.json'])('names %s where a published release carries the version',
    named => expect(NOTES.published('0.2.0')).toContain(named))

  it('names the tag among what a refresh rewrites', () =>
    expect(NOTES.refresh('0.2.0')).toContain('the tag'))
})
