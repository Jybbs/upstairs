import { describe, expect, it, vi } from 'vitest'

import * as spacetrack  from '../../catalog/spacetrack.ts'
import { AGES, FIELDS } from '../../lib/orbit/catalog.ts'
import { QUERIED }      from '../common/catalog.ts'
import * as answers     from '../common/spacetrack.ts'

const LOGIN   = { identity: 'observer', password: 'orbit 2026&more' }
/**
 * The records as Space-Track's JSON writes them, every value as text.
 */
const textual = QUERIED.map(record => Object.fromEntries(Object.entries(record).map(([key, value]) =>
  [key, String(value)])))
const answer = (body: unknown) => () => Response.json(body)

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
    const fetcher = answers.answering(answers.ACCEPTED, answer(textual), answers.LOGGED)
    expect(await new spacetrack.SpaceTrack(fetcher).elements(LOGIN))
      .toEqual(QUERIED.map(record => Object.fromEntries(FIELDS.map(field => [field, record[field]]))))
    const cookie = 'chocolatechip=abc; spacetrack_csrf_cookie=def'
    expect(fetcher.mock.calls.map(([url, init]) => [url, init?.headers])).toEqual([
      ['https://www.space-track.org/ajaxauth/login', undefined],
      [`https://www.space-track.org/${spacetrack.QUERY}`, { cookie }],
      ['https://www.space-track.org/ajaxauth/logout', { cookie }]
    ])
  })

  it('fails as rejected on a rejected login, querying nothing', async () => {
    const fetcher = answers.answering(answers.REJECTED)
    await expect(new spacetrack.SpaceTrack(fetcher).elements(LOGIN)).rejects.toThrow(spacetrack.Rejected)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each([
    ['a server error', () => new Response('', { status: 500 }), spacetrack.Unavailable],
    ['a body that is not JSON', () => new Response('<html>'), spacetrack.Unchecked],
    ['a list shorter than a catalog', answer(textual.slice(0, 10)), spacetrack.Unchecked],
    ['an object', answer({ error: 'busy' }), spacetrack.Unchecked],
    ['a record missing a field', answer([...textual.slice(1), { OBJECT_NAME: 'X' }]), spacetrack.Unchecked],
    ['a number that reads as none', answer([...textual.slice(1), { ...textual[0], BSTAR: 'n/a' }]),
      spacetrack.Unchecked]
  ])('fails on %s, logging out of the session', async (_, reply, kind) => {
    const fetcher = answers.answering(answers.ACCEPTED, reply, answers.LOGGED)
    await expect(new spacetrack.SpaceTrack(fetcher).elements(LOGIN)).rejects.toThrow(kind)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
