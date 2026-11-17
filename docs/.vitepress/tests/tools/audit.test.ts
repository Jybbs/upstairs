import { mkdtempDisposable } from 'node:fs/promises'
import { tmpdir }            from 'node:os'
import { join }              from 'node:path'

import { describe, expect, test } from 'vitest'

import { type TaskRun, runTask } from '../common/tasks.ts'

const ANOTHER   = 'GHSA-0000-0000-0000'
const BUN       = ['audit', '--cwd', 'docs']
const DENY      = ['deny', '--locked', '--manifest-path', 'rust/Cargo.toml']
const LIFTED    = 'GHSA-1111-1111-1111'
const PATCHED   = 'GHSA-3h5v-q93c-6h6q'
const UNPATCHED = 'GHSA-fc5q-39xc-vjpf'
const ANSWERS   = {
  [ANOTHER]   : '',
  [LIFTED]    : 'picomatch to 4.0.8\n',
  [PATCHED]   : 'ws to 5.2.4, ws to 8.17.1\n',
  [UNPATCHED] : ''
}
const CARGO = [
  [...DENY, 'check', 'advisories', 'bans', 'sources'],
  [...DENY, '--target', 'wasm32-unknown-unknown', 'check', 'licenses']
]

const it = test.extend('scratch', async ({ onTestFinished }) => {
  const scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-audit-'))
  onTestFinished(() => scratch.remove())
  await Promise.all(Object.entries(ANSWERS)
    .map(([id, answer]) => Bun.write(join(scratch.path, 'advisories', id), answer)))
  return scratch.path
})

/**
 * Runs `lock:audit` from `dir` with `AUDIT_IGNORE` set to `ignore`, where `gh
 * api /advisories/<id>` prints what its `--jq` filter prints of the advisory
 * `ANSWERS` holds for that ID and fails for any other, and each call takes the
 * next status in `exit`, the last repeating.
 */
const run = (
  dir    : string,
  ignore : string,
  args   : string[]          = [],
  exit   : number | number[] = 0
): Promise<TaskRun> => runTask('lock/audit', dir, {
  AUDIT_IGNORE    : ignore,
  STAND_IN_CALLS  : join(dir, 'calls'),
  STAND_IN_REMOTE : dir
}, args, exit)

describe('lock:audit', () => {
  it('runs the plain audit given an empty list', async ({ scratch }) =>
    expect(await run(scratch, '')).toMatchObject({ calls: [BUN, ...CARGO], code: 0, stderr: '' }))

  it(
    'reads each listed advisory and passes --ignore for each no release patches, ahead of further arguments',
    async ({ scratch }) =>
      expect(await run(scratch, `${UNPATCHED} A ReDoS\n\n${ANOTHER} Another\n`, ['--json']))
        .toMatchObject({
          code   : 0,
          stderr : '',
          calls  : [
            ['api', `/advisories/${UNPATCHED}`],
            ['api', `/advisories/${ANOTHER}`],
            [...BUN, `--ignore=${ANOTHER}`, `--ignore=${UNPATCHED}`, '--json'],
            ...CARGO
          ]
        })
  )

  it('fails before either audit, naming each entry to delete and its patched release', async ({ scratch }) =>
    expect(await run(scratch, `${PATCHED} patched\n${UNPATCHED} unpatched\n${LIFTED} patched\n`))
      .toMatchObject({
        code   : 1,
        stderr : `lock:audit found a release patching ${PATCHED}, so delete its line from AUDIT_IGNORE in `
               + '.mise/config.toml and lift ws to 5.2.4, ws to 8.17.1\n'
               + `lock:audit found a release patching ${LIFTED}, so delete its line from AUDIT_IGNORE in `
               + '.mise/config.toml and lift picomatch to 4.0.8\n',
        calls  : [
          ['api', `/advisories/${PATCHED}`],
          ['api', `/advisories/${UNPATCHED}`],
          ['api', `/advisories/${LIFTED}`]
        ]
      }))

  it('fails before either audit where gh cannot read a listed advisory', async ({ scratch }) =>
    expect(await run(scratch, 'GHSA-xxxx-xxxx-xxxx unknown'))
      .toMatchObject({ calls: [['api', '/advisories/GHSA-xxxx-xxxx-xxxx']], code: 1 }))

  it.for<[string, number[], string[][]]>([
    ['bun audit', [3], [BUN]],
    ['the first cargo-deny check', [0, 3], [BUN, CARGO[0]]]
  ])(
    'exits with the status of %s where it fails, running nothing after it',
    async ([, exit, calls], { scratch }) =>
      expect(await run(scratch, '', [], exit)).toMatchObject({ calls, code: 3 })
  )
})
