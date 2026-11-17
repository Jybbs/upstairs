import { describe, expect, it, vi } from 'vitest'

import * as spacetrack from '../../catalog/spacetrack.ts'
import * as answers   from '../common/spacetrack.ts'

const LOGIN = { identity: 'observer', password: 'orbit 2026&more' }

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
