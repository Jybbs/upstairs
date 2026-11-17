/**
 * Logs in to Space-Track once and out of the session it opens, telling an
 * accepted login from a rejected one. The login endpoint answers 200 either
 * way, its body `""` for an accepted login and `{"Login":"Failed"}` for a
 * rejected one, setting the session's cookie on an accepted one.
 */
import type { Login } from './netrc.ts'

export const HOST = 'www.space-track.org'
/**
 * The longest wait for an answer from Space-Track, in milliseconds.
 */
const WAIT          = 30_000
export const ORIGIN = `https://${HOST}`

/**
 * Marks a request Space-Track did not answer, or answered with anything but
 * 200 or a login's verdict.
 */
export class Unavailable extends Error {}

/**
 * Sends the login and logout requests through `fetcher`, each aborted once no
 * answer arrives within `wait` milliseconds.
 */
export class SpaceTrack {
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly wait = WAIT) {}

  /**
   * Logs in with `login`, returning whether Space-Track accepted it, and logs
   * out of the session an accepted login opens before returning.
   */
  async accepts(login: Login) {
    const body   = new URLSearchParams({ identity: login.identity, password: login.password })
    const answer = await this.send('ajaxauth/login', { body, method: 'POST' })
    const reply  = await answer.json().catch(() => undefined) as unknown
    if (reply === '') {
      await this.logOut(answer.headers.getSetCookie())
      return true
    }
    if (typeof reply === 'object' && reply !== null && 'Login' in reply && reply.Login === 'Failed')
      return false
    throw new Unavailable('Space-Track answered the login with neither an acceptance nor a rejection')
  }

  private async logOut(cookies: string[]) {
    const cookie = cookies.map(header => header.split(';', 1)[0]).join('; ')
    await (await this.send('ajaxauth/logout', { headers: { cookie } })).body?.cancel()
  }

  private async send(path: string, init: RequestInit) {
    const signal = AbortSignal.timeout(this.wait)
    const answer = await this.fetcher(`${ORIGIN}/${path}`, { ...init, signal })
      .catch((cause: unknown) => { throw new Unavailable('Space-Track could not be reached', { cause }) })
    if (answer.status === 200) return answer
    await answer.body?.cancel()
    throw new Unavailable(`Space-Track answered ${answer.status}`)
  }
}
