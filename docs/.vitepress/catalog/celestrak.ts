/**
 * Requests the active catalog from CelesTrak and checks that what came back is
 * a list of at least `AT_LEAST` records, telling a connection Cloudflare could
 * not open apart from a request that reached CelesTrak.
 */
import type { Record } from '../lib/orbit/catalog.ts'

/**
 * What halts the download cycle once a request reaches CelesTrak, where a
 * refusal keeps the status, the headers in `KEPT`, and the first `EXCERPT`
 * characters of the body CelesTrak answered with.
 */
export type Failure =
  | { kind: 'refused', reason: string, body: string, headers: { [name: string]: string }, status: number }
  | { kind: 'unanswered' | 'unchecked', reason: string }

const AGENT    = 'upstairs-catalog'
const AT_LEAST = 5000
/**
 * The most characters of a refusal's body a halt keeps.
 */
export const EXCERPT = 4096
/**
 * The longest wait for the headers of an answer, in milliseconds, which runs
 * past the 19 seconds Cloudflare waits for a connection before answering 522.
 */
export const HEADER_WAIT = 30_000
/**
 * The headers of a refusal a halt keeps.
 */
export const KEPT   = ['cf-ray', 'content-type', 'location', 'retry-after']
export const SOURCE = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
/**
 * The statuses Cloudflare answers with when it cannot open a connection to
 * CelesTrak.
 */
const UNCONNECTED = [521, 522, 523]

/**
 * Marks a download that halts the cycle, carrying the failure the halt
 * records.
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
 * `EXCERPT` characters have arrived.
 */
const refusalOf = async (response: Response): Promise<Failure> => {
  let body = ''
  for await (const text of response.body?.pipeThrough(new TextDecoderStream()) ?? []) {
    body += text
    if (body.length >= EXCERPT) break
  }
  return {
    body    : body.slice(0, EXCERPT),
    headers : Object.fromEntries([...response.headers].filter(([name]) => KEPT.includes(name))),
    kind    : 'refused',
    reason  : `CelesTrak answered ${response.status}`,
    status  : response.status
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
