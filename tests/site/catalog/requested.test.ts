import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RUN_PATH, type Requested, SECRET, requested } from '../../catalog/requested.ts'
import { stubSubtle }                              from '../common/subtle.ts'

const HELD    = 'held-token'
const OUTCOME = { elements: 'stored', satcat: 'current' }

/**
 * Sends `init` to `path` with the service holding `env`, returning the answer
 * and the stand-in for the cycle.
 */
const sent = async (init: RequestInit, env: Requested = { [SECRET]: HELD }, path = RUN_PATH) => {
  const run    = vi.fn(async () => OUTCOME)
  const answer = await requested(env, new Request(`https://upstairs.fyi${path}`, init), run)
  return { answer, run }
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

describe('the run path', () => {
  let equal: ReturnType<typeof stubSubtle>

  beforeEach(() => { equal = stubSubtle() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('runs one cycle for a POST carrying the token the service holds, answering its outcome as JSON',
    async () => {
      const { answer, run } = await sent({ headers: bearer(HELD), method: 'POST' })
      expect(run).toHaveBeenCalledOnce()
      expect(answer?.headers.get('content-type')).toMatch(/^application\/json/)
      expect(await answer?.json()).toEqual(OUTCOME)
    })

  it.each<[string, RequestInit, Requested?, string?]>([
    ['a POST carrying another token', { headers: bearer('other'), method: 'POST' }],
    ['a POST carrying no token', { method: 'POST' }],
    ['a POST carrying the token without its scheme', { headers: { authorization: HELD }, method: 'POST' }],
    ['a GET carrying the token', { headers: bearer(HELD) }],
    ['a POST carrying the token to another path',
      { headers: bearer(HELD), method: 'POST' }, undefined, '/catalog.bin'],
    ['a POST while the service holds no secret', { headers: bearer('undefined'), method: 'POST' }, {}]
  ])('leaves %s to the catalog route, running nothing', async (_, init, env, path) => {
    const { answer, run } = await sent(init, env, path)
    expect(answer).toBeUndefined()
    expect(run).not.toHaveBeenCalled()
  })

  it('compares digests of one length whatever the length of the token sent', async () => {
    await sent({ headers: bearer('a'.repeat(500)), method: 'POST' })
    expect(equal.mock.calls.map(pair => pair.map(digest => digest.byteLength))).toEqual([[32, 32]])
  })
})
