/**
 * Requests the active catalog from CelesTrak and checks that what came back is
 * a list of at least `AT_LEAST` records, telling a connection Cloudflare could
 * not open apart from a request that reached CelesTrak.
 */
import type { Record } from '../lib/orbit/catalog.ts'

const AGENT    = 'upstairs-catalog'
const AT_LEAST = 5000
/**
 * The longest wait for the headers of an answer, in milliseconds, which runs
 * past the 19 seconds Cloudflare waits for a connection before answering 522.
 */
export const HEADER_WAIT = 30_000
export const SOURCE      = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
/**
 * The statuses Cloudflare answers with when it cannot open a connection to
 * CelesTrak.
 */
const UNCONNECTED = [521, 522, 523]

/**
 * Marks a connection Cloudflare could not open, which the cycle then opens from
 * the next region.
 */
export class Unreachable extends Error {}

/**
 * Returns the records of a catalog, failing on anything but a list of
 * `AT_LEAST` records or more.
 */
export const checked = (records: unknown) => {
  if (Array.isArray(records) && records.length >= AT_LEAST) return records as Record[]
  throw new Error(`Expected a list of ${AT_LEAST} or more records, got `
                + JSON.stringify(records).slice(0, 60))
}

/**
 * Reads the catalog from `answer`, failing with `Unreachable` where Cloudflare
 * could not connect or `answer` rejects with anything but a `TimeoutError`. A
 * `TimeoutError` is thrown again unchanged, and any other answer but 200, a
 * redirect included, fails with a plain error.
 */
export const download = async (answer: Promise<Response>): Promise<Record[]> => {
  const response = await answer.catch((error: Error) => {
    throw error.name === 'TimeoutError' ? error : new Unreachable(String(error))
  })
  if (UNCONNECTED.includes(response.status)) {
    await response.body?.cancel()
    throw new Unreachable(`Cloudflare answered ${response.status}`)
  }
  if (response.status !== 200) throw new Error(`CelesTrak answered ${response.status}`)
  return checked(await response.json())
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
