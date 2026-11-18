/**
 * Writes the catalog file into `docs/public/` as the catalog service stores
 * it, from the elements Space-Track serves for each payload CelesTrak's SATCAT
 * marks active, querying Space-Track with the login saved in `~/.netrc`.
 * `--elements` reads a saved answer to the Space-Track query and `--satcat` a
 * saved SATCAT file in place of each download, and the file is dated by the
 * modification time of the elements file where one is given.
 */
import { readFile, stat, writeFile } from 'node:fs/promises'
import { homedir }                   from 'node:os'
import { join }                      from 'node:path'
import { parseArgs }                 from 'node:util'

import { FILE }               from '../lib/orbit/catalog.ts'
import * as celestrak         from './celestrak.ts'
import { AT_LEAST, activeOf } from './cycle.ts'
import { encode }             from './encode.ts'
import { Netrc }              from './netrc.ts'
import * as spacetrack        from './spacetrack.ts'

/**
 * What a run reads and writes beyond the files its flags name.
 */
interface Io {
  error   : (line: string) => void
  fetcher : typeof fetch
  home    : string
  print   : (line: string) => void
  target  : string
}

const OPTIONS = { elements: { type: 'string' }, satcat: { type: 'string' } } as const

/**
 * Runs the task with the arguments in `argv`, returning its exit status, and
 * fails with the reason where CelesTrak or Space-Track answers with no catalog,
 * the `--elements` file holds no JSON, or fewer than `AT_LEAST` payloads are
 * active.
 */
export const run = async (argv: string[], io: Io) => {
  const { elements, satcat }   = parseArgs({ args: argv, options: OPTIONS }).values
  const path                   = join(io.home, '.netrc')
  const { identity, password } = (await Netrc.read(path)).savedFor(spacetrack.HOST)
  const query                  = elements !== undefined
    ? async () => spacetrack.queriedOf(JSON.parse(await readFile(elements, 'utf8')))
    : identity !== undefined && password !== undefined
      ? () => new spacetrack.SpaceTrack(io.fetcher).elements({ identity, password })
      : undefined
  if (query === undefined) {
    io.error(`No Space-Track login is saved in ${path}, so save one through mise run catalog:login.`)
    return 1
  }
  try {
    const records = await query()
    const codes   = satcat !== undefined
      ? celestrak.codesOf(await readFile(satcat, 'utf8'))
      : await celestrak.download(celestrak.fetchFrom(io.fetcher, celestrak.SATCAT), celestrak.codesOf)
    const fetched = elements !== undefined ? (await stat(elements)).mtimeMs : Date.now()
    const active  = activeOf(codes, records)
    if (active.length < AT_LEAST) {
      io.error(`Expected ${AT_LEAST} or more active payloads, got ${active.length}.`)
      return 1
    }
    await writeFile(io.target, encode(fetched, active))
    io.print(`${active.length} satellites written to ${io.target}`)
    return 0
  } catch (error) {
    if (!(error instanceof celestrak.Failed || error instanceof celestrak.Unreachable
          || error instanceof spacetrack.Failure || error instanceof SyntaxError)) throw error
    io.error(`${error.message}.`)
    return 1
  }
}

if (import.meta.main)
  process.exitCode = await run(process.argv.slice(2), {
    error   : line => console.error(line),
    fetcher : fetch,
    home    : homedir(),
    print   : line => console.log(line),
    target  : join(import.meta.dirname, '../../public', FILE)
  })
