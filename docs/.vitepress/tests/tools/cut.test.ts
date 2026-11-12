import { describe, expect, it, vi } from 'vitest'

import { contextOf, draftOf, NOTES, outcomeOf } from '../../tools/cut.ts'

const BEFORE = 'ec695b92119cf872109c4faf09cf93e7bf4af861'
const SHA    = '761cc15aaf0c1e2a3b4c5d6e7f8091a2b3c4d5e6'

const release = (tag_name: string, draft = false) => ({ draft, tag_name })

describe('outcomeOf', () => {
  it.each([
    ['no release carries the version', [release('0.1.0')], 'create'],
    ['the repository holds no release', [], 'create'],
    ['the one release tags the version behind a v prefix', [release('v0.2.0')], 'create'],
    ['a draft carries the version', [release('0.1.0'), release('0.2.0', true)], 'drafted'],
    ['a published release carries the version', [release('0.2.0')], 'published']
  ])('reads the releases of a moved version, returns its outcome, and creates only a missing draft where %s',
    async (_, releases, outcome) => {
      const create = vi.fn(async () => {})
      expect(await outcomeOf(async () => releases, create, '0.2.0', '0.1.0')).toBe(outcome)
      expect(create).toHaveBeenCalledTimes(outcome === 'create' ? 1 : 0)
    })

  it('returns the outcome of the releases on a run with no previous version', async () =>
    expect(await outcomeOf(async () => [release('0.2.0', true)], async () => {}, '0.2.0')).toBe('drafted'))

  it('stops on an unmoved version without reading the releases', async () => {
    const read = vi.fn(async () => [])
    expect(await outcomeOf(read, async () => {}, '0.2.0', '0.2.0')).toBe('unmoved')
    expect(read).not.toHaveBeenCalled()
  })

  it('fails where the releases cannot be read', () =>
    expect(outcomeOf(() => Promise.reject(new Error('HTTP 502')), async () => {}, '0.2.0', '0.1.0'))
      .rejects.toThrow('HTTP 502'))

  it('fails where the draft cannot be created', () =>
    expect(outcomeOf(async () => [], () => Promise.reject(new Error('HTTP 422')), '0.2.0', '0.1.0'))
      .rejects.toThrow('HTTP 422'))
})

describe('draftOf', () => {
  it('creates the version as a draft with generated notes, titled for it and targeting the commit', () =>
    expect(draftOf('0.2.0', 'Jybbs/upstairs', SHA)).toEqual([
      'release', 'create', '0.2.0',
      '--draft', '--generate-notes', '--repo', 'Jybbs/upstairs', '--target', SHA, '--title', '0.2.0'
    ]))
})

describe('contextOf', () => {
  it.each([
    ['push', BEFORE],
    ['workflow_dispatch', undefined]
  ])('reads the commit a %s run compares with, the repository, and the commit the draft targets',
    (event, before) =>
      expect(contextOf({
        BEFORE,
        GITHUB_EVENT_NAME : event,
        GITHUB_REPOSITORY : 'Jybbs/upstairs',
        GITHUB_SHA        : SHA
      })).toEqual({ before, repository: 'Jybbs/upstairs', target: SHA }))
})

describe('NOTES', () => {
  it.each([
    ['create', '::notice::'],
    ['drafted', '::notice::'],
    ['published', '::warning::'],
    ['unmoved', '::notice::']
  ] as const)('prints the %s outcome with the version, opening on %s', (outcome, opening) =>
    expect(NOTES[outcome]('0.2.0')).toMatch(new RegExp(`^${opening}.*0\\.2\\.0`)))
})
