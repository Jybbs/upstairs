import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { FIELDS, type Record } from '../src/orbit/catalog.ts'

const SOURCE  = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
const TARGET  = 'public/catalog.json'
const AT_LEAST = 5000

/**
 * Reads the catalog from a file given as the first argument, or from CelesTrak.
 */
const read = async (path: string | undefined): Promise<Record[]> => {
  if (path) return JSON.parse(await readFile(path, 'utf8'))
  const response = await fetch(SOURCE, { headers: { 'user-agent': 'upstairs-catalog' } })
  if (!response.ok) throw new Error(`CelesTrak answered ${response.status}`)
  return response.json()
}

const records = await read(process.argv[2])
if (records.length < AT_LEAST) throw new Error(`Only ${records.length} records, expected at least ${AT_LEAST}`)

await mkdir(dirname(TARGET), { recursive: true })
await writeFile(TARGET, JSON.stringify({
  fetched : new Date().toISOString(),
  fields  : FIELDS,
  rows    : records.map(record => FIELDS.map(field => record[field])),
}))
console.log(`${records.length} satellites written to ${TARGET}`)
