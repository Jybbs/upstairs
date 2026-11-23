import { join } from 'node:path'

import { describe } from 'vitest'

import { it }      from '../common/scratch.ts'
import { runTask } from '../common/tasks.ts'

const LINUX = 'mise-v2-linux-x64-ubuntu26-2026.11.10'
const LINKS = 'bun+github:EmbarkStudios/cargo-about+lychee+rust+github:wasm-bindgen/wasm-bindgen'
const PRESS = 'bun+github:EmbarkStudios/cargo-about+rust+github:wasm-bindgen/wasm-bindgen'

/**
 * An entry in the shape `gh cache list --json createdAt,id,key` answers with,
 * its key built the way the provision action builds it from a tool-set label
 * and the default key `jdx/mise-action` renders.
 */
const entry = (id: number, createdAt: string, label: string, rest = LINUX) =>
  ({ createdAt, id, key: `provision-${label}-${rest}-08d1-dc97` })

const CASES = [
  {
    name    : 'keeps the newest entry of each tool set whose labels share a hyphenated tool',
    deleted : ['1', '3'],
    caches  : [
      entry(1, '2026-11-20T00:00:00Z', PRESS),
      entry(2, '2026-11-22T00:00:00Z', PRESS),
      entry(3, '2026-11-20T00:00:00Z', LINKS),
      entry(4, '2026-11-21T00:00:00Z', LINKS)
    ]
  },
  {
    name    : 'keeps the newest entry of one tool set on each platform',
    deleted : ['5'],
    caches  : [
      entry(5, '2026-11-20T00:00:00Z', 'rust'),
      entry(6, '2026-11-22T00:00:00Z', 'rust'),
      entry(7, '2026-11-01T00:00:00Z', 'rust', 'mise-v2-linux-arm64-ubuntu26-2026.11.10'),
      entry(8, '2026-11-02T00:00:00Z', 'rust', 'mise-v2-macos-arm64-macos15-2026.11.10')
    ]
  },
  {
    name    : 'deletes an entry an older key prefix or mise version saved',
    deleted : ['10', '9'],
    caches  : [
      entry(9, '2026-11-01T00:00:00Z', 'bun', 'mise-v1-linux-x64-ubuntu26-2026.11.10'),
      entry(10, '2026-11-02T00:00:00Z', 'bun', 'mise-v2-linux-x64-ubuntu26-2026.11.4'),
      entry(11, '2026-11-22T00:00:00Z', 'bun')
    ]
  },
  {
    name    : 'keeps every entry whose key the grouping cannot read',
    deleted : [],
    caches  : [
      { createdAt: '2026-11-01T00:00:00Z', id: 12, key: 'provision-bun' },
      { createdAt: '2026-11-02T00:00:00Z', id: 13, key: 'provision-rust' }
    ]
  }
]

describe.concurrent('gha:prune', () => {
  it.for(CASES)('$name', async ({ caches, deleted }, { expect, scratch }) => {
    await Bun.write(join(scratch, 'caches.json'), JSON.stringify(caches))
    const { calls, code } = await runTask('gha/prune', scratch, {
      STAND_IN_CALLS  : join(scratch, 'calls'),
      STAND_IN_REMOTE : scratch
    })
    expect({ code, head: calls[0], ids: calls.slice(1).map(call => call.join(' ')).toSorted() })
      .toEqual({ code: 0, head: ['cache', 'list'], ids: deleted.map(id => `cache delete ${id}`) })
  })
})
