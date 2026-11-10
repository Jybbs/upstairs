import type { OMMJsonObject } from 'satellite.js'

export interface Catalog {
  fetched : string
  fields  : readonly string[]
  rows    : readonly (readonly (string | number)[])[]
}

export type Record = OMMJsonObject & { NORAD_CAT_ID: number, OBJECT_NAME: string }

/**
 * The fields of a catalog record that the site reads: the name, plus every
 * field the orbit model reads.
 */
export const FIELDS = [
  'OBJECT_NAME', 'NORAD_CAT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION',
  'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'
] as const

/**
 * Rebuilds the records of a catalog file from its rows.
 */
export const recordsOf = ({ fields, rows }: Catalog): Record[] =>
  rows.map(row => Object.fromEntries(fields.map((field, index) => [field, row[index]])) as unknown as Record)
