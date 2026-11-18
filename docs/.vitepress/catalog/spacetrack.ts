/**
 * Logs in to Space-Track, telling an accepted login from a rejected one, and
 * queries the elements of the payloads in orbit inside the session it opens
 * before logging out of it. The login endpoint answers 200 either way, its
 * body `""` for an accepted login and `{"Login":"Failed"}` for a rejected one,
 * setting the session's cookie on an accepted one.
 */
import { AGES, FIELDS, type Record } from '../lib/orbit/catalog.ts'
import type { Login }                from './netrc.ts'

/**
 * The login under the names the catalog service reads it as its secrets.
 */
export type Secrets = { [name in (typeof SECRETS)[keyof typeof SECRETS]]: string }

export const HOST = 'www.space-track.org'
/**
 * The names the catalog service reads the login under.
 */
export const SECRETS = { identity: 'SPACE_TRACK_IDENTITY', password: 'SPACE_TRACK_PASSWORD' } as const
/**
 * The fewest records an answer to the query holds before it counts as a
 * catalog.
 */
const AT_LEAST      = 5000
/**
 * The longest wait for an answer from Space-Track, in milliseconds.
 */
const WAIT          = 30_000
export const ORIGIN = `https://${HOST}`
/**
 * The query of the `gp` class for the payloads with no decay date and an epoch
 * inside the age the map draws, the query Space-Track's API guidelines at
 * https://www.space-track.org/documentation#api-use-guidelines give for
 * elements that propagate, narrowed to payloads and widened from its 10 days to
 * the age the map draws.
 */
export const QUERY  = 'basicspacedata/query/class/gp/OBJECT_TYPE/PAYLOAD/decay_date/null-val/'
                    + `epoch/%3Enow-${AGES.limit}/format/json`

/**
 * Marks a login, a request, or an answer that keeps the query from returning a
 * catalog, naming its kind.
 */
export class Failure extends Error {
  readonly kind: 'rejected' | 'unavailable' | 'unchecked' = 'unavailable'
}

/**
 * Marks a login Space-Track rejected.
 */
export class Rejected extends Failure {
  override readonly kind = 'rejected'
}

/**
 * Marks a request Space-Track did not answer, or answered with anything but
 * 200 or a login's verdict.
 */
export class Unavailable extends Failure {}

/**
 * Marks an answer to the query that is not a catalog.
 */
export class Unchecked extends Failure {
  override readonly kind = 'unchecked'
}

/**
 * Returns the record the query answered with as `entry`, each number read from
 * the text Space-Track sends it as, or `undefined` where a field is missing or
 * a number reads as none.
 */
const recordOf = (entry: unknown) => {
  const fields = Object(entry) as { [field: string]: unknown }
  const record = Object.fromEntries(FIELDS.map(field => [
    field, field === 'OBJECT_NAME' || field === 'EPOCH' ? fields[field] : Number(fields[field] ?? NaN)
  ]))
  return Object.values(record).every(value => typeof value === 'string' || Number.isFinite(value))
    ? record as Record
    : undefined
}

/**
 * Returns the records of an answer to the query, failing on anything but a
 * list of `AT_LEAST` records or more, each holding every field in `FIELDS`.
 */
export const queriedOf = (answer: unknown) => {
  const records = Array.isArray(answer) ? answer.map(recordOf) : []
  if (records.length >= AT_LEAST && !records.includes(undefined)) return records as Record[]
  throw new Unchecked(`Expected a list of ${AT_LEAST} or more records, got `
                    + JSON.stringify(answer)?.slice(0, 60))
}

/**
 * Sends the login, query, and logout requests through `fetcher`, each aborted
 * once no answer arrives within `wait` milliseconds.
 */
export class SpaceTrack {
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly wait = WAIT) {}

  /**
   * Logs in with `login`, returning whether Space-Track accepted it, and logs
   * out of the session an accepted login opens before returning.
   */
  async accepts(login: Login) {
    return await this.session(login, async () => true) ?? false
  }

  /**
   * Logs in with `login`, queries `QUERY` inside the session, and logs out,
   * returning the records of the answer. A rejected login fails with
   * `Rejected`, a request that fails with `Unavailable`, and an answer that is
   * not a catalog with `Unchecked`.
   */
  async elements(login: Login) {
    const records = await this.session(login, async cookie => {
      const answer = await this.send(QUERY, { headers: { cookie } })
      return queriedOf(await answer.json().catch((error: unknown) => {
        throw new Unchecked(String(error))
      }))
    })
    if (records === undefined) throw new Rejected(`Space-Track rejected the login for ${login.identity}`)
    return records
  }

  /**
   * Sends one request through `fetcher` called with no `this`, since the
   * Workers runtime throws `TypeError: Illegal invocation` on a `fetch` called
   * as a method of another object.
   */
  private async send(path: string, init: RequestInit) {
    const { fetcher, wait } = this
    const answer = await fetcher(`${ORIGIN}/${path}`, { ...init, signal: AbortSignal.timeout(wait) })
      .catch((cause: unknown) => { throw new Unavailable('Space-Track could not be reached', { cause }) })
    if (answer.status === 200) return answer
    await answer.body?.cancel()
    throw new Unavailable(`Space-Track answered ${answer.status}`)
  }

  /**
   * Logs in with `login` and runs `use` with the session's cookie, logging out
   * once it settles, and returns what `use` returns, or `undefined` where
   * Space-Track rejected the login and opened no session.
   */
  private async session<T>(login: Login, use: (cookie: string) => Promise<T>) {
    const body   = new URLSearchParams({ identity: login.identity, password: login.password })
    const answer = await this.send('ajaxauth/login', { body, method: 'POST' })
    const reply  = await answer.json().catch(() => undefined) as unknown
    if (Object(reply).Login === 'Failed') return undefined
    if (reply !== '')
      throw new Unavailable('Space-Track answered the login with neither an acceptance nor a rejection')
    const cookie = answer.headers.getSetCookie().map(header => header.split(';', 1)[0]).join('; ')
    try {
      return await use(cookie)
    } finally {
      await (await this.send('ajaxauth/logout', { headers: { cookie } })).body?.cancel()
    }
  }
}
