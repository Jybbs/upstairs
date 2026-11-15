import { TOML }         from 'bun'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { afterEach, expect, it, vi } from 'vitest'

import manifest from '../../../package.json' with { type: 'json' }
import loader   from '../../lib/site/provenance.data.ts'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => 'ec695b9\n') }))

const LOCKED = TOML.parse(readFileSync(new URL('../../../../rust/Cargo.lock', import.meta.url), 'utf8')) as {
  package: { name: string, version: string }[]
}

afterEach(() => vi.unstubAllEnvs())

it('reads the manifest version and repository, the commit at HEAD, and the locked sgp4', async () => {
  vi.stubEnv('SHA', undefined)
  expect(await loader.load([])).toEqual({
    commit     : 'ec695b9',
    repository : manifest.repository.url,
    sgp4       : LOCKED.package.find(({ name }) => name === 'sgp4')?.version,
    version    : manifest.version
  })
  expect(execFileSync).toHaveBeenCalledWith('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' })
})

it('names the commit SHA holds over the one at HEAD, abbreviated to seven characters', async () => {
  vi.stubEnv('SHA', '91d595f0c1e2a3b4c5d6e7f8091a2b3c4d5e6f70')
  expect((await loader.load([])).commit).toBe('91d595f')
})
