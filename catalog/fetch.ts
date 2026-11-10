/**
 * Writes the catalog file into `public/`, from CelesTrak or from a file of
 * records given as the first argument, dated by that file's modification time.
 */
import { readFile, stat, writeFile } from 'node:fs/promises'

import { FILE }              from '../src/orbit/catalog.ts'
import { checked, download } from './celestrak.ts'
import { encode }            from './encode.ts'

const TARGET = `public/${FILE}`

const path    = process.argv[2]
const records = path ? checked(JSON.parse(await readFile(path, 'utf8'))) : await download(fetch)
const fetched = path ? (await stat(path)).mtimeMs : Date.now()

await writeFile(TARGET, encode(fetched, records))
console.log(`${records.length} satellites written to ${TARGET}`)
