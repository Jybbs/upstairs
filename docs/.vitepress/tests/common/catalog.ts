import * as catalog from '../../lib/orbit/catalog.ts'
import full         from '../fixtures/records.json' with { type: 'json' }

/**
 * A catalog of 5000 records, enough to pass each check on the size of an
 * answer, repeating the fixture's records under catalog numbers of their own.
 */
export const QUERIED = Array.from({ length: 5000 }, (_, row) => ({
  ...(full as unknown as catalog.Record[])[row % full.length],
  NORAD_CAT_ID: 100_000 + row
}))

/**
 * Reads a catalog file back into its records and the time its elements were
 * fetched, or into no records where `file` is missing.
 */
export const contentsOf = async (file: unknown) => {
  const records = [] as catalog.Record[]
  let fetched: number | undefined
  if (file !== undefined)
    for await (const segment of catalog.segmentsOf(new Blob([file as Uint8Array<ArrayBuffer>]).stream())) {
      records.push(...segment.records)
      fetched = segment.fetched
    }
  return { fetched, records }
}
