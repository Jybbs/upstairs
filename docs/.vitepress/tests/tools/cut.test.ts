import { describe, expect, it, vi } from 'vitest'

import { NOTES, outcomeOf } from '../../tools/cut.ts'

const release = (tag_name: string, draft = false) => ({ draft, tag_name })

describe('outcomeOf', () => {
  it.each([
    ['no release carries the version', [release('0.1.0')], 'create'],
    ['the repository holds no release', [], 'create'],
    ['the one release tags the version behind a v prefix', [release('v0.2.0')], 'create'],
    ['a draft carries the version', [release('0.1.0'), release('0.2.0', true)], 'drafted'],
    ['a published release carries the version', [release('0.2.0')], 'published']
  ])('reads the releases of a moved version and returns its outcome where %s', async (_, releases, outcome) =>
    expect(await outcomeOf(async () => releases, '0.2.0', '0.1.0')).toBe(outcome))

  it('returns the outcome of the releases on a run with no previous version', async () =>
    expect(await outcomeOf(async () => [release('0.2.0', true)], '0.2.0')).toBe('drafted'))

  it('stops on an unmoved version without reading the releases', async () => {
    const read = vi.fn(async () => [])
    expect(await outcomeOf(read, '0.2.0', '0.2.0')).toBe('unmoved')
    expect(read).not.toHaveBeenCalled()
  })

  it('fails where the releases cannot be read', () =>
    expect(outcomeOf(() => Promise.reject(new Error('HTTP 502')), '0.2.0', '0.1.0'))
      .rejects.toThrow('HTTP 502'))
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
