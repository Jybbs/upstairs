import { appendFile, cp, mkdtempDisposable } from 'node:fs/promises'
import { STATUS_CODES }                      from 'node:http'
import { tmpdir }                            from 'node:os'
import { join }                              from 'node:path'

import { $ } from 'bun'

import * as repository from '../../tools/repository.ts'
import type { Live }   from '../../tools/sync.ts'

interface Answer {
  code    : number
  stderr? : string
  stdout? : string
}

interface Call {
  args  : string[]
  body? : unknown
}

/**
 * The state the stand-in answers with, where `failures` maps a request's
 * method and path to the HTTP status it fails with.
 */
export interface Remote {
  failures : Record<string, number>
  labels   : string[]
  rulesets : Live[]
}

const BODY_FLAGS = ['-F', '-f', '--field', '--input', '--raw-field']
const FIXTURES   = import.meta.dirname
/**
 * The root of the worktree the suite runs in.
 */
export const ROOT = join(FIXTURES, '../../../..')
/**
 * The settings `sync.ts rulesets` reads in place of `.github/settings.toml`,
 * which turn `pages` on.
 */
export const SETTINGS = join(FIXTURES, 'settings.toml')
const SCRIPT          = join(ROOT, 'docs/.vitepress/tools/sync.ts')

/**
 * Answers one `gh` call from `remote`, failing a request `remote.failures`
 * names, printing the live label names for `gh label list` and the live
 * rulesets for a `GET` of the rulesets, and printing an empty object for every
 * other call.
 */
const answer = (args: string[], remote: Remote): Answer => {
  const { method, path } = requestOf(args)
  const status           = remote.failures[`${method} ${path}`]
  if (status) return { code: 1, stderr: `gh: ${STATUS_CODES[status]} (HTTP ${status})` }
  if (args[0] === 'label') return { code: 0, stdout: labelListOf(args, remote.labels) }
  const rulesets = method === 'GET' && path.endsWith('/rulesets')
  return { code: 0, stdout: JSON.stringify(rulesets ? remote.rulesets : {}) }
}

/**
 * Prints the live label names the way `gh label list --json name` does, as a
 * JSON array, or as one name per line ending in a newline once `--jq .[].name`
 * reads the names out of it.
 */
const labelListOf = (args: string[], names: string[]) => args.includes('.[].name')
  ? names.map(name => `${name}\n`).join('')
  : JSON.stringify(names.map(name => ({ name })))

/**
 * Reads the method and path of one `gh` call from its arguments, taking the
 * method `--method` names, or else `POST` for a call sending a body or a field
 * and `GET` for any other.
 */
const requestOf = (args: string[]) => ({
  method : args.includes('--method')
    ? args[args.indexOf('--method') + 1]
    : BODY_FLAGS.some(flag => args.includes(flag)) ? 'POST' : 'GET',
  path   : args.at(-1) ?? ''
})

/**
 * One run of `sync.ts` against the stand-in, holding every call it made to
 * `gh` and what it printed.
 */
export class Run {
  constructor(
    private readonly calls : Call[],
    readonly code          : number,
    readonly stderr        : string,
    readonly stdout        : string
  ) {}

  /**
   * Runs `sync.ts <task>` against the stand-in answering from `remote`, in a
   * copy of the declarations under `.github/` and `.mise/` whose settings are
   * those of `SETTINGS`, with only the stand-in on its `PATH`.
   */
  static async of(task: 'labels' | 'rulesets', remote: Remote): Promise<Run> {
    await using scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-gh-'))
    const dir           = scratch.path
    const root          = join(dir, 'repository')
    await cp(join(ROOT, '.github'), join(root, '.github'), { recursive: true })
    await cp(join(ROOT, repository.FILES.sweep), join(root, repository.FILES.sweep))
    await cp(SETTINGS, join(root, repository.FILES.settings))
    await Bun.write(join(dir, 'remote.json'), JSON.stringify(remote))
    const result = await $`${process.execPath} ${SCRIPT} ${task}`
      .cwd(root)
      .env({ BUN: process.execPath, GH_STAND_IN: dir, PATH: join(FIXTURES, 'bin') })
      .nothrow()
      .quiet()
    return new Run(
      Bun.JSONL.parse(await Bun.file(join(dir, 'calls.jsonl')).text()) as Call[],
      result.exitCode,
      result.stderr.toString(),
      result.stdout.toString()
    )
  }

  /**
   * The lines the run printed, one per sentence.
   */
  get lines(): string[] {
    return this.stdout.split('\n').filter(Boolean)
  }

  /**
   * Every request the run sent but a `GET`, in the order sent.
   */
  get requests(): { body: unknown, method: string, path: string }[] {
    return this.calls
      .map(({ args, body }) => ({ body, ...requestOf(args) }))
      .filter(request => request.method !== 'GET')
  }
}

if (import.meta.main) {
  const dir  = process.env.GH_STAND_IN ?? ''
  const args = process.argv.slice(2)
  const body = args.includes('--input') ? await Bun.stdin.json() : undefined
  await appendFile(join(dir, 'calls.jsonl'), `${JSON.stringify({ args, body })}\n`)
  const { code, stderr = '', stdout = '' } = answer(args, await Bun.file(join(dir, 'remote.json')).json())
  process.stdout.write(stdout)
  process.stderr.write(stderr)
  process.exit(code)
}
