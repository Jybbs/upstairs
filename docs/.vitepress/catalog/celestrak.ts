/**
 * Requests the active catalog from CelesTrak and checks that what came back is
 * a list of at least `AT_LEAST` records, telling a connection Cloudflare could
 * not open apart from an answer CelesTrak sent.
 */
import type { Record } from '../lib/orbit/catalog.ts'

const AGENT    = 'upstairs-catalog'
const AT_LEAST = 5000
/**
 * The longest wait for the headers of an answer, in milliseconds.
 */
export const CONNECT = 10_000
export const SOURCE  = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
/**
 * The statuses Cloudflare answers with when it cannot connect to CelesTrak.
 */
const UNCONNECTED = [522, 523]

/**
 * Marks a request that never reached CelesTrak, which the cycle then sends from
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
 * Reads the catalog from `answer`, failing with `Unreachable` where it rejects
 * or Cloudflare could not connect, and with a plain error on any other answer
 * but 200, a redirect included.
 */
export const download = async (answer: Promise<Response>): Promise<Record[]> => {
  const response = await answer.catch((error: unknown) => { throw new Unreachable(String(error)) })
  if (UNCONNECTED.includes(response.status)) {
    await response.body?.cancel()
    throw new Unreachable(`Cloudflare answered ${response.status}`)
  }
  if (response.status !== 200) throw new Error(`CelesTrak answered ${response.status}`)
  return checked(await response.json())
}

/**
 * Sends the catalog request through `fetcher` with redirects left unfollowed,
 * aborting it where no headers arrive within `CONNECT` milliseconds.
 */
export const fetchCatalog = async (fetcher: typeof fetch) => {
  const bound = new AbortController()
  const timer = setTimeout(() => bound.abort(new Error(`No answer within ${CONNECT} ms`)), CONNECT)
  const init  = { headers: { 'user-agent': AGENT }, redirect: 'manual', signal: bound.signal } as const
  try {
    return await fetcher(SOURCE, init)
  } finally {
    clearTimeout(timer)
  }
}
