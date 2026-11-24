/**
 * The columns of CelesTrak's SATCAT file in the order it writes them, per
 * https://celestrak.org/satcat/satcat-format.php.
 */
const COLUMNS = [
  'OBJECT_NAME', 'OBJECT_ID', 'NORAD_CAT_ID', 'OBJECT_TYPE', 'OPS_STATUS_CODE', 'OWNER', 'LAUNCH_DATE',
  'LAUNCH_SITE', 'DECAY_DATE', 'PERIOD', 'INCLINATION', 'APOGEE', 'PERIGEE', 'RCS', 'DATA_STATUS_CODE',
  'ORBIT_CENTER', 'ORBIT_TYPE'
]

/**
 * Writes `time` as the SATCAT directory writes the time of a file.
 */
export const mtimeOf = (time: number) => new Date(time).toISOString().slice(0, 19).replace('T', ' ')

/**
 * Builds the SATCAT directory listing the SATCAT file at `listed` beside the
 * legacy text file, each entry shaped as CelesTrak's directories list a file.
 */
export const directoryBody = (listed: number, name = 'satcat.csv') => JSON.stringify([
  { FILE_MTIME: `${mtimeOf(listed - 60_000)} UTC`, FILE_NAME: 'satcat.txt', FILE_SIZE: 9_000_000 },
  { FILE_MTIME: `${mtimeOf(listed)} UTC`, FILE_NAME: name, FILE_SIZE: 12_000_000 }
])

/**
 * Builds a SATCAT file holding one row for each of `rows`, its catalog number,
 * object type, and operational status code, under a name holding a comma and
 * a quote.
 */
export const satcatBody = (rows: readonly (readonly [id: number, type: string, code: string])[]) =>
  [COLUMNS, ...rows.map(([id, type, code]) => [
    `"SAT ""${id}"", A"`, '2026-001A', id, type, code, 'US', '2026-01-01', 'AFETR', '', '95.1', '53.0',
    '550', '540', '', '', 'EA', 'ORB'
  ])].map(row => row.join(',')).join('\r\n') + '\r\n'

/**
 * Builds the body of the 403 CelesTrak answers while its data has not updated
 * since the last download from the same address, byte for byte as CelesTrak
 * sends it, line breaks included, naming the download at `since`.
 */
export const unchangedBody = (since: string) =>
    'GP data has not updated since your last successful\r\n'
  + `download of GROUP=active at ${since} UTC.\r\n`
  + 'Data is updated once every 2 hours.'
