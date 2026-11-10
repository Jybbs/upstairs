import { TOML }         from 'bun'
import { readFileSync } from 'node:fs'

import type { Plugin } from 'vitepress'

interface Manifest {
  dependencies : Record<string, unknown>
}

/**
 * Appends the crates' notices at `notices` to the file Vite's `build.license`
 * writes as `fileName`, once Vite has written the packages' notices into it.
 * The build fails where `notices` holds no notice for a crate the manifest at
 * `manifest` lists under its dependencies.
 */
export const licensesOf = (fileName: string, manifest: URL, notices: URL): Plugin => ({
  applyToEnvironment : ({ name }) => name === 'client',
  name               : 'upstairs:licenses',
  generateBundle     : {
    order: 'post',
    handler(_, bundle) {
      const asset = bundle[fileName]
      if (asset?.type !== 'asset') this.error(`The client bundle holds no ${fileName}`)
      const text    = readFileSync(notices, 'utf8')
      const crates  = Object.keys((TOML.parse(readFileSync(manifest, 'utf8')) as Manifest).dependencies)
      const missing = crates.filter(name => !text.includes(`\n## ${name} - `))
      if (missing.length) this.error(`${notices.pathname} holds no notice for ${missing.join(', ')}`)
      asset.source += text
    }
  }
})
