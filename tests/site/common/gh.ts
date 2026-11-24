import { cp, mkdtempDisposable }    from 'node:fs/promises'
import { STATUS_CODES }             from 'node:http'
import { tmpdir }                   from 'node:os'
import { delimiter, dirname, join } from 'node:path'

import { $ } from 'bun'

import * as repository from '../../../docs/.vitepress/tools/repository.ts'
import type { Live }   from '../../../docs/.vitepress/tools/sync.ts'
import { ROOT }        from './reads.ts'

interface Request {
  body   : unknown
  method : string
  path   : string
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

const COMMON = import.meta.dirname
/**
 * The settings `sync.ts rulesets` reads in place of `.github/settings.toml`,
 * which turn `pages` on.
 */
export const SETTINGS = join(COMMON, '../fixtures/settings.toml')
const PATH            = [join(COMMON, 'bin'), dirname(Bun.which('mise')!)].join(delimiter)
const SCRIPT          = join(ROOT, 'docs/.vitepress/tools/sync.ts')

/**
 * One run of `sync.ts` against the stand-in, holding every call it made to
 * `gh` and what it printed.
 */
export class Run {
  constructor(
    private readonly calls : Request[],
    readonly code          : number,
    readonly stderr        : string,
    readonly stdout        : string
  ) {}

  /**
   * Runs `sync.ts <task>` against the stand-in answering from `remote`, in a
   * copy of the site's manifest and of the declarations under `.github/` and
   * `.mise/`, whose settings are those of `SETTINGS`, on a `PATH` holding the
   * stand-in and then the directory `mise` runs from.
   */
  static async of(task: 'labels' | 'rulesets', remote: Remote): Promise<Run> {
    await using scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-gh-'))
    const dir           = scratch.path
    const root          = join(dir, 'repository')
    await cp(join(ROOT, '.github'), join(root, '.github'), { recursive: true })
    await cp(join(ROOT, repository.FILES.manifest), join(root, repository.FILES.manifest))
    await cp(join(ROOT, repository.FILES.sweep), join(root, repository.FILES.sweep))
    await cp(SETTINGS, join(root, repository.FILES.settings))
    await Bun.write(join(dir, 'calls.jsonl'), '')
    await Bun.write(join(dir, 'failures'), Object.entries(remote.failures)
      .map(([request, status]) => `${request}\tgh: ${STATUS_CODES[status]} (HTTP ${status})\n`).join(''))
    await Bun.write(join(dir, 'labels'), remote.labels.map(name => `${name}\n`).join(''))
    await Bun.write(join(dir, 'rulesets'), `${JSON.stringify(remote.rulesets)}\n`)
    const result = await $`${process.execPath} ${SCRIPT} ${task}`
      .cwd(root)
      .env({ GH_STAND_IN: dir, PATH })
      .nothrow()
      .quiet()
    return new Run(
      Bun.JSONL.parse(await Bun.file(join(dir, 'calls.jsonl')).text()) as Request[],
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
  get requests(): Request[] {
    return this.calls.filter(request => request.method !== 'GET')
  }
}
