/**
 * Requests the active catalog from CelesTrak and checks that what came back is
 * a list of at least `AT_LEAST` records, telling a connection Cloudflare could
 * not open apart from a request that reached CelesTrak.
 */
import type { Record } from '../lib/orbit/catalog.ts'

/**
 * What starts a wait of the download cycle once a request reaches CelesTrak,
 * where a refusal or a 403 for data that has not updated keeps the status, the
 * headers in `KEPT`, and the first `EXCERPT` characters of the body CelesTrak
 * answered with, and a 403 for data that has not updated keeps the time of the
 * download its body names under `since`.
 */
export type Failure =
  | {
      body    : string
      headers : { [name: string]: string }
      kind    : 'refused' | 'unchanged'
      reason  : string
      since?  : string
      status  : number
    }
  | { kind: 'unanswered' | 'unchecked', reason: string }

const AGENT    = 'upstairs-catalog'
const AT_LEAST = 5000
/**
 * The most characters of a refusal's body a wait keeps.
 */
export const EXCERPT = 4096
/**
 * The longest wait for the headers of an answer, in milliseconds, which runs
 * past the 19 seconds Cloudflare waits for a connection before answering 522.
 */
export const HEADER_WAIT = 30_000
/**
 * The headers of a refusal a wait keeps.
 */
export const KEPT   = ['cf-ray', 'content-type', 'location', 'retry-after']
export const SOURCE = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
/**
 * The message of the 403 CelesTrak answers while its data has not updated
 * since the last download from the same address, per its GP data documentation
 * at https://celestrak.org/NORAD/documentation/gp-data-formats.php, matched
 * once each run of whitespace in the body reads as one space and capturing the
 * day and the time of that download in UTC.
 */
const UNCHANGED = /GP data has not updated since your last successful download(?: of \S+ at (\S+) (\S+) UTC)?/
/**
 * The statuses Cloudflare answers with when it cannot open a connection to
 * CelesTrak.
 */
const UNCONNECTED = [521, 522, 523]

/**
 * Marks a download that starts a wait of the cycle, carrying the failure the
 * wait records.
 */
export class Failed extends Error {
  constructor(readonly failure: Failure) {
    super(failure.reason)
  }
}

/**
 * Marks a connection Cloudflare could not open, which the cycle then opens from
 * the next region.
 */
export class Unreachable extends Error {}

/**
 * Reads the refusal out of an answer other than 200, canceling its body once
 * `EXCERPT` characters have arrived, and marks a 403 whose body holds
 * `UNCHANGED` as unchanged, keeping the time of the download it names where
 * that time reads as a date. Where reading the body fails, the refusal keeps
 * the characters already read and names the error in its reason.
 */
const refusalOf = async (response: Response): Promise<Failure> => {
  let body   = ''
  let reason = `CelesTrak answered ${response.status}`
  try {
    for await (const text of response.body?.pipeThrough(new TextDecoderStream()) ?? []) {
      body += text
      if (body.length >= EXCERPT) break
    }
  } catch (error) {
    reason += `, and reading its body failed with ${String(error)}`
  }
  const unchanged = response.status === 403 ? UNCHANGED.exec(body.replaceAll(/\s+/g, ' ')) : null
  const since     = Date.parse(`${unchanged?.[1]}T${unchanged?.[2]}Z`)
  return {
    body    : body.slice(0, EXCERPT),
    headers : Object.fromEntries([...response.headers].filter(([name]) => KEPT.includes(name))),
    kind    : unchanged === null ? 'refused' : 'unchanged',
    reason  : reason,
    status  : response.status,
    ...Number.isNaN(since) ? {} : { since: new Date(since).toISOString() }
  }
}

/**
 * Returns the records of a catalog, failing on anything but a list of
 * `AT_LEAST` records or more.
 */
export const checked = (records: unknown) => {
  if (Array.isArray(records) && records.length >= AT_LEAST) return records as Record[]
  throw new Failed({
    kind   : 'unchecked',
    reason : `Expected a list of ${AT_LEAST} or more records, got ${JSON.stringify(records).slice(0, 60)}`
  })
}

/**
 * Reads the catalog from `answer`, failing with `Unreachable` where Cloudflare
 * could not connect or `answer` rejects with anything but a `TimeoutError`. A
 * `TimeoutError`, any other answer but 200, a redirect included, and a body
 * that is not a catalog each fail with `Failed`.
 */
export const download = async (answer: Promise<Response>): Promise<Record[]> => {
  const response = await answer.catch((error: Error) => {
    throw error.name === 'TimeoutError'
      ? new Failed({ kind: 'unanswered', reason: error.message })
      : new Unreachable(String(error))
  })
  if (UNCONNECTED.includes(response.status)) {
    await response.body?.cancel()
    throw new Unreachable(`Cloudflare answered ${response.status}`)
  }
  if (response.status !== 200) throw new Failed(await refusalOf(response))
  return checked(await response.json().catch((error: unknown) => {
    throw new Failed({ kind: 'unchecked', reason: String(error) })
  }))
}

/**
 * Sends the catalog request through `fetcher` with redirects left unfollowed,
 * aborting it with a `TimeoutError` where no headers arrive within
 * `HEADER_WAIT` milliseconds.
 */
export const fetchCatalog = async (fetcher: typeof fetch) => {
  const bound   = new AbortController()
  const timeout = new DOMException(`No answer within ${HEADER_WAIT} ms`, 'TimeoutError')
  const timer   = setTimeout(() => bound.abort(timeout), HEADER_WAIT)
  const init    = { headers: { 'user-agent': AGENT }, redirect: 'manual', signal: bound.signal } as const
  try {
    return await fetcher(SOURCE, init)
  } catch (error) {
    throw bound.signal.aborted ? timeout : error
  } finally {
    clearTimeout(timer)
  }
}
