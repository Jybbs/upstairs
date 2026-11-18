/**
 * Makes a random token for the catalog service's run path, sets it as the
 * service's secret through `wrangler`, and saves it in the `upstairs.fyi` entry
 * of `~/.netrc` once the secret is set, printing nothing of the token.
 */
import { randomBytes } from 'node:crypto'
import { writeFile }   from 'node:fs/promises'
import { homedir }     from 'node:os'
import { join }        from 'node:path'

import { wrangler }               from './login.ts'
import { Netrc }                  from './netrc.ts'
import { RUN_ADDRESS }            from './request.ts'
import { type Requested, SECRET } from './requested.ts'

/**
 * What a run reads and writes beyond `~/.netrc`, where `set` returns the exit
 * status of the command setting the secret.
 */
interface Io {
  error : (line: string) => void
  home  : string
  print : (line: string) => void
  set   : (secrets: Required<Requested>) => number
}

/**
 * The bytes of randomness a token holds, written as 43 characters of
 * base64url.
 */
const BYTES = 32

/**
 * Sets a new token as the secret and saves it, returning the task's exit
 * status, and leaves `~/.netrc` as it was where the secret could not be set.
 */
export const run = async (io: Io) => {
  const path  = join(io.home, '.netrc')
  const netrc = await Netrc.read(path)
  const token = randomBytes(BYTES).toString('base64url')
  if (io.set({ [SECRET]: token }) !== 0) {
    io.error(`Wrangler could not set the catalog service’s ${SECRET} secret, so run the task again as `
           + 'CLOUDFLARE_API_TOKEN=… mise run catalog:mint with a Cloudflare API token allowed to edit '
           + 'Workers Scripts.')
    return 1
  }
  const login = { identity: SECRET, password: token }
  await writeFile(path, netrc.withLogin(RUN_ADDRESS.host, login), { mode: 0o600 })
  io.print(`Set a new token as the catalog service’s ${SECRET} secret and saved it in ${path}.`)
  return 0
}

if (import.meta.main)
  process.exitCode = await run({
    error : line => console.error(line),
    home  : homedir(),
    print : line => console.log(line),
    set   : wrangler
  })
