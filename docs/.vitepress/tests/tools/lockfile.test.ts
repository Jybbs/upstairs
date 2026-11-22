import { join } from 'node:path'

import { $ }          from 'bun'
import { expect, it } from 'vitest'

import { driftsOf }        from '../../tools/lockfile.ts'
import { ROOT }            from '../common/reads.ts'
import { it as scratched } from '../common/scratch.ts'

const CHECKED    = [
  { platform: 'linux-x64',   tool: 'bun',  version: '1.4.4' },
  { platform: 'macos-arm64', tool: 'bun',  version: '1.4.4' },
  { platform: 'linux-x64',   tool: 'rust', version: '1.100.0' }
]
const LOCKED     = { url: 'https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-x64.zip' }
const ENTRY      = {
  backend               : 'core:bun',
  'platforms.linux-x64' : LOCKED,
  specifiers            : ['1.4.4'],
  version               : '1.4.4'
}
const UNDECLARED = 'which .mise/config.toml no longer declares'

it.each([
  ['nothing for a lockfile matching what the config declares', { bun: [ENTRY] }, []],
  [
    'a tool the config no longer declares',
    { bun: [ENTRY], zizmor: [{ backend: 'aqua:zizmorcore/zizmor', version: '1.32.0' }] },
    [`zizmor@1.32.0 in .mise/mise.lock, ${UNDECLARED}`]
  ],
  [
    'a version the config no longer declares',
    { bun: [{ ...ENTRY, version: '1.4.3' }, ENTRY] },
    [`bun@1.4.3 in .mise/mise.lock, ${UNDECLARED}`]
  ],
  [
    'a platform the config no longer declares for a declared version',
    { bun: [{ ...ENTRY, 'platforms.windows-x64': LOCKED }] },
    [`bun@1.4.4 on windows-x64 in .mise/mise.lock, ${UNDECLARED}`]
  ],
  [
    'a platform entry holding no URL',
    { bun: [{ ...ENTRY, 'platforms.macos-arm64': { checksum: 'sha256:c240' } }] },
    ['no URL for bun@1.4.4 on macos-arm64 in .mise/mise.lock']
  ],
  [
    'an undeclared version alone, though its platform entry holds no URL',
    { bun: [{ ...ENTRY, 'platforms.linux-x64': {}, version: '1.4.3' }, ENTRY] },
    [`bun@1.4.3 in .mise/mise.lock, ${UNDECLARED}`]
  ],
  [
    'nothing for a tool locking no platform',
    { bun: [ENTRY], rust: [{ options: {}, version: '1.100.0' }] },
    []
  ]
])('reports %s', (_, tools, drifts) => expect(driftsOf(CHECKED, tools)).toEqual(drifts))

it('reports every locked tool version where the config declares none', () =>
  expect(driftsOf([], { bun: [ENTRY] })).toEqual([`bun@1.4.4 in .mise/mise.lock, ${UNDECLARED}`]))

it('reports nothing for a version the check matches to no locked entry', () =>
  expect(driftsOf([{ platform: null, tool: 'bun', version: '1.4.4' }], { bun: [ENTRY] })).toEqual([]))

scratched('exits 1 naming each drift the lockfile holds', async ({ scratch }) => {
  await Bun.write(join(scratch, '.mise/mise.lock'), [
    '[[tools.bun]]\nversion = "1.4.4"\n',
    '[[tools.lychee]]\nversion = "0.24.2"\n',
    '[[tools.zizmor]]\nversion = "1.32.0"\n'
  ].join('\n'))
  const stdin = new Response(JSON.stringify(CHECKED))
  const run   = await $`bun run ${join(ROOT, 'docs/.vitepress/tools/lockfile.ts')} < ${stdin}`
    .cwd(scratch)
    .nothrow()
    .quiet()
  expect([run.exitCode, run.stderr.toString()]).toEqual([
    1,
      `lock:check found lychee@0.24.2 in .mise/mise.lock, ${UNDECLARED}, so run mise relock\n`
    + `lock:check found zizmor@1.32.0 in .mise/mise.lock, ${UNDECLARED}, so run mise relock\n`
  ])
})
