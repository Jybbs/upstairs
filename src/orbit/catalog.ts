/**
 * Declares the fields a catalog file keeps for each record, and rebuilds the
 * records from the rows the file holds them in.
 */

export interface Catalog {
  fetched : string
  fields  : readonly string[]
  rows    : readonly (readonly (string | number)[])[]
}

export type Record = {
  readonly [Field in typeof FIELDS[number]]: Field extends 'OBJECT_NAME' | 'EPOCH' ? string : number
}

/**
 * The fields of a catalog record the site reads, meaning its name and number
 * beside the elements SGP4 starts an orbit from.
 */
export const FIELDS = [
  'OBJECT_NAME', 'NORAD_CAT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION',
  'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'
] as const

/**
 * Rebuilds the records of a catalog file from its rows.
 */
export const recordsOf = ({ fields, rows }: Catalog): Record[] =>
  rows.map(row => Object.fromEntries(fields.map((field, index) => [field, row[index]])) as unknown as Record)
