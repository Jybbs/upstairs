/**
 * Saves the Space-Track login in the `www.space-track.org` entry of `~/.netrc`
 * once Space-Track accepts it, checks the saved login under `--check`, and sets
 * it as the catalog service's secrets through `wrangler` under `--worker`.
 */
import { type SpawnSyncOptions, spawnSync } from 'node:child_process'
import { readFile, writeFile }              from 'node:fs/promises'
import { homedir }                          from 'node:os'
import { join }                             from 'node:path'
import { createInterface }                  from 'node:readline/promises'
import { Writable }                         from 'node:stream'
import { parseArgs }                        from 'node:util'

import { Netrc }       from './netrc.ts'
import * as spacetrack from './spacetrack.ts'

/**
 * What a run reads and writes beyond `~/.netrc`, where `prompt` is left out
 * while no terminal is attached and `set` returns the exit status of the
 * command setting the secrets.
 */
interface Io {
  error      : (line: string) => void
  home       : string
  print      : (line: string) => void
  set        : (secrets: Secrets) => number
  spaceTrack : Pick<spacetrack.SpaceTrack, 'accepts'>
  prompt?    : Pick<Prompt, 'ask' | 'conceal'>
}

type Secrets = { [name in (typeof SECRETS)[keyof typeof SECRETS]]: string }

/**
 * Runs `command` with `args` to its exit, as `spawnSync` does.
 */
type Spawn = (command: string, args: string[], options: SpawnSyncOptions) => { status: number | null }

const OPTIONS = { check: { type: 'boolean' }, worker: { type: 'boolean' } } as const
/**
 * The names the catalog service reads the login under.
 */
export const SECRETS = { identity: 'SPACE_TRACK_IDENTITY', password: 'SPACE_TRACK_PASSWORD' } as const

/**
 * Reads a line at a time from a terminal, where a concealed line writes
 * nothing of what is typed to the output.
 */
export class Prompt {
  private muted          = false
  private readonly shown : Writable

  constructor(private readonly input: NodeJS.ReadableStream, private readonly output: NodeJS.WritableStream) {
    this.shown = new Writable({
      write: (chunk, encoding, done) => {
        if (!this.muted) output.write(chunk, encoding)
        done()
      }
    })
  }

  /**
   * Asks `query` with `saved` already typed in, so Enter keeps it.
   */
  async ask(query: string, saved = '') {
    return (await this.question(query, saved)).trim()
  }

  /**
   * Asks `query` with nothing of the answer shown as it is typed.
   */
  async conceal(query: string) {
    this.output.write(query)
    this.muted = true
    try {
      return await this.question('')
    } finally {
      this.muted = false
      this.output.write('\n')
    }
  }

  /**
   * Asks `query` with `typed` already typed in, through an interface holding
   * the terminal only until the answer arrives.
   */
  private async question(query: string, typed = '') {
    const lines = createInterface({ input: this.input, output: this.shown, terminal: true })
    try {
      const answer = lines.question(query)
      lines.write(typed)
      return await answer
    } finally {
      lines.close()
    }
  }
}

const savedIn = async (path: string) =>
  Netrc.parse(await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return ''
    throw error
  }))

/**
 * Sets `secrets` on the catalog service through `wrangler secret bulk`, which
 * reads them as JSON on its input, returning the command's exit status.
 */
export const wrangler = (secrets: Secrets, spawn: Spawn = spawnSync) =>
  spawn('bun', ['x', '--no-install', 'wrangler', 'secret', 'bulk', '--config', 'wrangler.json'], {
    cwd   : import.meta.dirname,
    input : JSON.stringify(secrets),
    stdio : ['pipe', 'inherit', 'inherit']
  }).status ?? 1

/**
 * Runs the task with the arguments in `argv`, returning its exit status. With
 * no flag it prompts for a login and saves it once Space-Track accepts it, and
 * `--check`, `--worker`, or both read the saved login instead, `--check`
 * logging in with it before `--worker` sets it on the catalog service.
 */
export const run = async (argv: string[], io: Io) => {
  const fail = (line: string) => {
    io.error(line)
    return 1
  }
  const path  = join(io.home, '.netrc')
  const netrc = await savedIn(path)
  const saved = netrc.savedFor(spacetrack.HOST)
  try {
    const flags = parseArgs({ args: argv, options: OPTIONS }).values
    if (!flags.check && !flags.worker) {
      if (!io.prompt)
        return fail('No terminal is attached, so run mise run catalog:login in a terminal to '
                  + 'type the Space-Track login.')
      const identity = await io.prompt.ask('Space-Track username: ', saved.identity)
      const login    = { identity, password: await io.prompt.conceal('Space-Track password: ') }
      if (!await io.spaceTrack.accepts(login))
        return fail(`Space-Track rejected the login for ${identity}, so check the username and password `
                  + `at ${spacetrack.ORIGIN} and run mise run catalog:login again.`)
      await writeFile(path, netrc.withLogin(spacetrack.HOST, login), { mode: 0o600 })
      io.print(`Logged in to Space-Track as ${identity} and saved the login in ${path}.`)
      return 0
    }
    const { identity, password } = saved
    if (identity === undefined || password === undefined)
      return fail(`No Space-Track login is saved in ${path}, so save one through mise run catalog:login.`)
    if (flags.check) {
      if (!await io.spaceTrack.accepts({ identity, password }))
        return fail(`Space-Track rejected the login saved for ${identity}, so renew the account at `
                  + `${spacetrack.ORIGIN} or save a new password through mise run catalog:login.`)
      io.print(`Space-Track accepted the login saved for ${identity}.`)
    }
    if (flags.worker) {
      if (io.set({ [SECRETS.identity]: identity, [SECRETS.password]: password }) !== 0)
        return fail('Wrangler could not set the catalog service’s secrets, so check its Cloudflare login '
                  + 'through bun x wrangler whoami from docs/ and run the task again.')
      io.print(`Set the Space-Track login for ${identity} as the catalog service’s secrets.`)
    }
    return 0
  } catch (error) {
    if (error instanceof spacetrack.Unavailable)
      return fail(`${error.message}, so check ${spacetrack.ORIGIN} and run the task again once it answers.`)
    if ((error as NodeJS.ErrnoException).code?.startsWith('ERR_PARSE_ARGS'))
      return fail(`The task takes no ${argv.join(' ')}, so run mise run catalog:login with --check, `
                + '--worker, both, or neither.')
    throw error
  }
}

if (import.meta.main) {
  const prompt = process.stdin.isTTY ? new Prompt(process.stdin, process.stdout) : undefined
  try {
    process.exitCode = await run(process.argv.slice(2), {
      error      : line => console.error(line),
      home       : homedir(),
      print      : line => console.log(line),
      set        : wrangler,
      spaceTrack : new spacetrack.SpaceTrack(),
      ...prompt ? { prompt } : {}
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ABORT_ERR') throw error
    process.exitCode = 130
  }
}
