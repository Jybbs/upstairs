/**
 * Runs one cycle of the catalog service through its run path with the token
 * saved in the `upstairs.fyi` entry of `~/.netrc`, printing the outcome the
 * service answers with as JSON and nothing of the token.
 */
import { homedir } from 'node:os'
import { join }    from 'node:path'

import manifest         from '../../package.json' with { type: 'json' }
import type { Cycle }   from './cycle.ts'
import { Netrc }        from './netrc.ts'
import { RUN_PATH }     from './requested.ts'

/**
 * What a run reads and writes beyond `~/.netrc`.
 */
interface Io {
  error : (line: string) => void
  fetch : (input: URL, init: RequestInit) => Promise<Response>
  home  : string
  print : (line: string) => void
}

/**
 * The address of the run path, whose host names the entry of `~/.netrc`
 * holding the token.
 */
export const RUN_ADDRESS = new URL(RUN_PATH, manifest.homepage)

/**
 * Sends the request with the saved token, returning the task's exit status,
 * which is 0 only where the service stored the elements.
 */
export const run = async (io: Io) => {
  const fail = (line: string) => {
    io.error(line)
    return 1
  }
  const path         = join(io.home, '.netrc')
  const { password } = (await Netrc.read(path)).savedFor(RUN_ADDRESS.host)
  if (password === undefined)
    return fail(`No token for the catalog service is saved in ${path}, so make one through `
              + 'mise run catalog:mint.')
  const init     = { headers: { authorization: `Bearer ${password}` }, method: 'POST' }
  const response = await io.fetch(RUN_ADDRESS, init).catch((error: unknown) => {
    if (error instanceof TypeError) return undefined
    throw error
  })
  if (!response) return fail(`${RUN_ADDRESS} could not be reached, so run the task again once it answers.`)
  if (response.status === 404)
    return fail(`${RUN_ADDRESS} answered 404, as it does for a token other than the one the catalog service `
              + 'holds, so set a new one through mise run catalog:mint.')
  if (!response.ok)
    return fail(`${RUN_ADDRESS} answered ${response.status}, so read the catalog service’s Workers Logs.`)
  const outcome = await response.json() as Awaited<ReturnType<Cycle['run']>>
  io.print(JSON.stringify(outcome))
  if (outcome === 'early')
    return fail('The last attempt was under an hour ago, so the cycle ran nothing, and a run of the task '
              + 'after the hour has passed starts one.')
  if (outcome.elements !== 'stored')
    return fail('The catalog service stored no elements, so read the catalog.failed record in its '
              + 'Workers Logs.')
  return 0
}

if (import.meta.main)
  process.exitCode = await run({
    error : line => console.error(line),
    fetch : fetch,
    home  : homedir(),
    print : line => console.log(line)
  })
