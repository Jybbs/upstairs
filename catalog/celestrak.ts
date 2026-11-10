/**
 * Downloads the active catalog from CelesTrak and checks that what came back
 * is a list of records as long as the active catalog.
 */
import type { Record } from '../src/orbit/catalog.ts'

export const SOURCE = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'

const AGENT    = 'upstairs-catalog'
const AT_LEAST = 5000

/**
 * Returns the records of a catalog, failing on anything but a list as long as
 * the active catalog.
 */
export const checked = (records: unknown) => {
  if (Array.isArray(records) && records.length >= AT_LEAST) return records as Record[]
  throw new Error(`Expected a list of ${AT_LEAST} or more records, got `
                + JSON.stringify(records).slice(0, 60))
}

/**
 * Downloads the active catalog from CelesTrak, failing on any answer but 200,
 * a redirect included.
 */
export const download = async (fetcher: typeof fetch): Promise<Record[]> => {
  const response = await fetcher(SOURCE, { headers: { 'user-agent': AGENT }, redirect: 'manual' })
  if (response.status !== 200) throw new Error(`CelesTrak answered ${response.status}`)
  return checked(await response.json())
}
