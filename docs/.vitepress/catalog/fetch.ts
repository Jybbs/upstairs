/**
 * Writes the catalog file into `docs/public/`, from CelesTrak or from a file of
 * records given as the first argument, dated by that file's modification time.
 */
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join }                      from 'node:path'

import { FILE }       from '../lib/orbit/catalog.ts'
import * as celestrak from './celestrak.ts'
import { encode }     from './encode.ts'

const TARGET = join(import.meta.dirname, '../../public', FILE)

const path    = process.argv[2]
const records = path
  ? celestrak.checked(JSON.parse(await readFile(path, 'utf8')))
  : await celestrak.download(celestrak.fetchCatalog(fetch))
const fetched = path ? (await stat(path)).mtimeMs : Date.now()

await writeFile(TARGET, encode(fetched, records))
console.log(`${records.length} satellites written to ${TARGET}`)
