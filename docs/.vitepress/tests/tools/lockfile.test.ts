import { expect, it } from 'vitest'

import { driftsOf } from '../../tools/lockfile.ts'

const BUN        = { tool: 'bun', version: '1.4.4' }
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
    'a platform entry holding no URL',
    { bun: [{ ...ENTRY, 'platforms.macos-arm64': { checksum: 'sha256:c240' } }] },
    ['no URL for bun@1.4.4 on macos-arm64 in .mise/mise.lock']
  ],
  [
    'an undeclared version ahead of its platform entry holding no URL',
    { bun: [{ ...ENTRY, 'platforms.linux-x64': {}, version: '1.4.3' }, ENTRY] },
    [`bun@1.4.3 in .mise/mise.lock, ${UNDECLARED}`, 'no URL for bun@1.4.3 on linux-x64 in .mise/mise.lock']
  ],
  [
    'nothing for a tool locking no platform',
    { bun: [ENTRY], rust: [{ options: {}, version: '1.100.0' }] },
    []
  ]
])('reports %s', (_, tools, drifts) =>
  expect(driftsOf([BUN, { tool: 'rust', version: '1.100.0' }], tools)).toEqual(drifts))

it('reports every locked tool version where the config declares none', () =>
  expect(driftsOf([], { bun: [ENTRY] })).toEqual([`bun@1.4.4 in .mise/mise.lock, ${UNDECLARED}`]))
