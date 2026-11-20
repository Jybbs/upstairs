import { delimiter, join } from 'node:path'

import { $ } from 'bun'

import { ROOT } from './reads.ts'

/**
 * The environment a task runs under, where `STAND_IN_CALLS` names the file the
 * stand-ins record each call in.
 */
export type Env = Record<string, string> & { STAND_IN_CALLS: string }

/**
 * One run of a task file, holding each call it made to a stand-in as its
 * arguments, its exit status, and what it printed.
 */
export interface TaskRun {
  calls  : string[][]
  code   : number
  stderr : string
  stdout : string
}

/**
 * The `PATH` a task runs with, holding the stand-ins for `bun`, `cargo`, `gh`,
 * and `mise` ahead of the path the suite runs on.
 */
export const STAND_IN_PATH = [join(import.meta.dirname, 'check'), process.env.PATH].join(delimiter)

export const linesOf = (text: string): string[] => text.split('\n').filter(Boolean)

/**
 * Runs the task file at `.mise/tasks/<task>` of the worktree from `cwd` under
 * `env` laid over `STAND_IN_PATH`, the nth call to a stand-in other than `gh
 * api` exiting with the nth status in `exit`, every call counted, the last
 * repeating.
 */
export async function runTask(
  task : string,
  cwd  : string,
  env  : Env,
  args : string[]          = [],
  exit : number | number[] = 0
): Promise<TaskRun> {
  await Bun.write(env.STAND_IN_CALLS, '')
  const result = await $`${join(ROOT, '.mise/tasks', task)} ${args}`
    .cwd(cwd)
    .env({ PATH: STAND_IN_PATH, ...env, STAND_IN_EXIT: [exit].flat().join(' ') })
    .nothrow()
    .quiet()
  return {
    calls  : linesOf(await Bun.file(env.STAND_IN_CALLS).text()).map(call => call.split('\t')),
    code   : result.exitCode,
    stderr : result.stderr.toString(),
    stdout : result.stdout.toString()
  }
}
