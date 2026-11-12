import { TOML }         from 'bun'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { expect, it, vi } from 'vitest'

import manifest from '../../../package.json' with { type: 'json' }
import loader   from '../../lib/site/provenance.data.ts'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => 'ec695b9\n') }))

const LOCKED = TOML.parse(readFileSync(new URL('../../../../rust/Cargo.lock', import.meta.url), 'utf8')) as {
  package: { name: string, version: string }[]
}

it('reads the manifest version and repository, the commit at HEAD, and the locked sgp4', async () => {
  expect(await loader.load([])).toEqual({
    commit     : 'ec695b9',
    repository : manifest.repository.url,
    sgp4       : LOCKED.package.find(({ name }) => name === 'sgp4')?.version,
    version    : manifest.version
  })
  expect(execFileSync).toHaveBeenCalledWith('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' })
})
