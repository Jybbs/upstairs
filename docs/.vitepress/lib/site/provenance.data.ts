import { TOML }         from 'bun'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { defineLoader } from 'vitepress'

import manifest from '../../../package.json' with { type: 'json' }

interface Lockfile {
  package : { name: string, version: string }[]
}

interface Provenance {
  commit     : string
  repository : string
  sgp4       : string
  version    : string
}

declare const data: Provenance
export { data }

const LOCKFILE = new URL('../../../../rust/Cargo.lock', import.meta.url)

/**
 * Reads the version the site's manifest carries, its repository, the
 * abbreviated commit the site is pressed from, which `SHA` names where it is
 * set and `HEAD` names otherwise, and the `sgp4` version `rust/Cargo.lock`
 * resolves, once per press or serve.
 */
export default defineLoader({
  load: (): Provenance => ({
    commit     : process.env.SHA?.slice(0, 7)
      ?? execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
    repository : manifest.repository.url,
    sgp4       : (TOML.parse(readFileSync(LOCKFILE, 'utf8')) as Lockfile).package
      .find(({ name }) => name === 'sgp4')!.version,
    version    : manifest.version
  })
})
