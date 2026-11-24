import { describe, expect, it, vi } from 'vitest'

import * as spacetrack    from '../../../docs/.vitepress/catalog/spacetrack.ts'
import { AGES, FIELDS }   from '../../../docs/.vitepress/lib/orbit/catalog.ts'
import { QUERIED }        from '../common/catalog.ts'
import { LOST, stopping } from '../common/fetchers.ts'
import * as answers       from '../common/spacetrack.ts'

const LOGIN = { identity: 'observer', password: 'orbit 2026&more' }
/**
 * The records as Space-Track's JSON writes them, every value as text.
 */
const textual = QUERIED.map(record => Object.fromEntries(Object.entries(record).map(([key, value]) =>
  [key, String(value)])))

/**
 * The ways a logout fails.
 */
const UNCLOSED = [
  ['answered with a server error', () => new Response('', { status: 500 }), 'Space-Track answered 500'],
  ['answered with a server error whose body stops arriving',
    stopping('', LOST, { status: 500 }), 'Space-Track answered 500'],
  ['left unanswered', () => { throw LOST }, 'Space-Track could not be reached']
] as const

/**
 * Queries the elements, Space-Track answering with `replies`, returning them or
 * the error the query fails with beside each error it reports for the logout.
 */
const queried = async (...replies: (() => Response)[]) => {
  const unclosed = vi.fn<(error: Error) => void>()
  const fetcher  = answers.answering(...replies)
  const result   = await new spacetrack.SpaceTrack(fetcher).elements(LOGIN, unclosed)
    .catch((error: Error) => error)
  return { fetcher, result, unclosed: unclosed.mock.calls.map(([error]) => error) }
}

describe('the stand-in for fetch', () => {
  it.each([['undefined', undefined], ['globalThis', globalThis]])('answers a call with %s as its this',
    async (_, context) => {
      await expect(answers.answering(answers.LOGGED).call(context, spacetrack.ORIGIN))
        .resolves.toBeInstanceOf(Response)
    })

  it('refuses a call made as a method of the client before answering, as the Workers runtime does', () => {
    const fetcher = answers.answering(answers.LOGGED)
    expect(() => fetcher.call(new spacetrack.SpaceTrack(fetcher), spacetrack.ORIGIN)).toThrow(TypeError)
  })
})

describe('a login', () => {
  it('posts the login over HTTPS once and logs out of the session it opens, with its cookies', async () => {
    const fetcher = answers.answering(answers.ACCEPTED, answers.LOGGED)
    expect(await new spacetrack.SpaceTrack(fetcher).accepts(LOGIN)).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const [[login, sent], [logout, closed]] = fetcher.mock.calls
    expect([login, sent!.method, String(sent!.body)]).toEqual([
      'https://www.space-track.org/ajaxauth/login', 'POST', 'identity=observer&password=orbit+2026%26more'
    ])
    expect([logout, closed!.method, closed!.headers]).toEqual([
      'https://www.space-track.org/ajaxauth/logout', undefined,
      { cookie: 'chocolatechip=abc; spacetrack_csrf_cookie=def' }
    ])
  })

  it('returns false for a rejected login, opening no session to log out of', async () => {
    const fetcher = answers.answering(answers.REJECTED)
    expect(await new spacetrack.SpaceTrack(fetcher).accepts(LOGIN)).toBe(false)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each([
    ['the login unanswered', [() => { throw new TypeError('fetch failed') }],
      'Space-Track could not be reached'],
    ['a server error', [() => new Response('', { status: 503 })], 'Space-Track answered 503'],
    ['a body naming no verdict', [() => new Response('<html>')],
      'Space-Track answered the login with neither an acceptance nor a rejection'],
    ['a body that stops arriving', [stopping('"', LOST)],
      'Space-Track’s answer stopped arriving'],
    ['a server error whose body stops arriving', [stopping('', LOST, { status: 503 })],
      'Space-Track answered 503'],
    ['a logout answered with a server error', [answers.ACCEPTED, () => new Response('', { status: 500 })],
      'Space-Track answered 500']
  ])('fails as unavailable on %s', async (_, replies, reason) => {
    const failure = new spacetrack.SpaceTrack(answers.answering(...replies)).accepts(LOGIN)
    await expect(failure).rejects.toThrow(new spacetrack.Unavailable(reason))
  })

  it('fails as unavailable once no answer arrives within the wait', async () => {
    const fetcher = vi.fn((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) =>
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))))
    const failure = new spacetrack.SpaceTrack(fetcher, 10).accepts(LOGIN)
    await expect(failure).rejects.toThrow(spacetrack.Unavailable)
  })
})

describe('a query', () => {
  it('asks the gp class for payloads with no decay date and an epoch inside the age the map draws', () => {
    expect(spacetrack.QUERY).toBe('basicspacedata/query/class/gp/OBJECT_TYPE/PAYLOAD/decay_date/null-val/'
                                + `epoch/%3Enow-${AGES.limit}/format/json`)
  })

  it('logs in, queries inside the session with its cookies, and logs out, reading each number', async () => {
    const fetcher = answers.answering(answers.ACCEPTED, answers.json(textual), answers.LOGGED)
    expect(await new spacetrack.SpaceTrack(fetcher).elements(LOGIN, vi.fn()))
      .toEqual(QUERIED.map(record => Object.fromEntries(FIELDS.map(field => [field, record[field]]))))
    const cookie = 'chocolatechip=abc; spacetrack_csrf_cookie=def'
    expect(fetcher.mock.calls.map(([url, init]) => [url, init?.headers])).toEqual([
      ['https://www.space-track.org/ajaxauth/login', undefined],
      [`https://www.space-track.org/${spacetrack.QUERY}`, { cookie }],
      ['https://www.space-track.org/ajaxauth/logout', { cookie }]
    ])
  })

  it('fails as rejected on a rejected login, querying nothing', async () => {
    const { fetcher, result } = await queried(answers.REJECTED)
    expect(result).toEqual(new spacetrack.Rejected('Space-Track rejected the login'))
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each(UNCLOSED)('returns the records the query answered with past a logout %s, reporting it',
    async (_, logout, reason) => {
      const { result, unclosed } = await queried(answers.ACCEPTED, answers.json(textual), logout)
      expect(result).toHaveLength(QUERIED.length)
      expect(unclosed).toEqual([new spacetrack.Unavailable(reason)])
    })

  it.each(UNCLOSED)('fails as the query did past a logout %s, reporting the logout beside it',
    async (_, logout, reason) => {
      const { result, unclosed } = await queried(answers.ACCEPTED, answers.json([]), logout)
      expect(result).toBeInstanceOf(spacetrack.Unchecked)
      expect(unclosed).toEqual([new spacetrack.Unavailable(reason)])
    })

  it('reports nothing for a logout whose body stops arriving after a 200', async () => {
    const { result, unclosed } = await queried(answers.ACCEPTED, answers.json(textual), stopping('', LOST))
    expect(result).toHaveLength(QUERIED.length)
    expect(unclosed).toEqual([])
  })

  it.each([
    ['as the connection is lost', LOST],
    ['within the wait', new DOMException('The operation timed out', 'TimeoutError')]
  ])('fails as unavailable on a body that stops arriving %s, logging out', async (_, error) => {
    const body = JSON.stringify(textual).slice(0, -100)
    const { fetcher, result } = await queried(answers.ACCEPTED, stopping(body, error), answers.LOGGED)
    expect(result).toEqual(new spacetrack.Unavailable('Space-Track’s answer stopped arriving'))
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  const expected = (got: string) => `Expected a list of 5000 or more records holding every field, got ${got}`

  it.each([
    ['a server error', () => new Response('', { status: 500 }),
      new spacetrack.Unavailable('Space-Track answered 500')],
    ['a body that is not JSON', () => new Response('<html>'), new spacetrack.Unchecked(expected('undefined'))],
    ['an empty list', answers.json([]), new spacetrack.Unchecked(expected('0 of 0'))],
    ['a list shorter than a catalog', answers.json(textual.slice(0, 10)),
      new spacetrack.Unchecked(expected('10 of 10'))],
    ['an object', answers.json({ error: 'busy' }), new spacetrack.Unchecked(expected('object'))],
    ['a record missing a field', answers.json([...textual.slice(1), { OBJECT_NAME: 'X' }]),
      new spacetrack.Unchecked(expected('4999 of 5000'))],
    ['a number that reads as none', answers.json([...textual.slice(1), { ...textual[0], BSTAR: 'n/a' }]),
      new spacetrack.Unchecked(expected('4999 of 5000'))]
  ])('fails on %s with a reason holding none of its text, logging out of the session',
    async (_, reply, error) => {
      const { fetcher, result } = await queried(answers.ACCEPTED, reply, answers.LOGGED)
      expect(result).toEqual(error)
      expect(result).toBeInstanceOf(error.constructor)
      expect(fetcher).toHaveBeenCalledTimes(3)
    })
})
