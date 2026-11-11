import { TOML }         from 'bun'
import { readdirSync, readFileSync } from 'node:fs'

import type { Plugin } from 'vitepress'

interface Manifest {
  dependencies : Record<string, unknown>
}

/**
 * The notice of the package `name` under `node_modules/`, headed as Vite
 * heads each notice it writes.
 */
const noticeOf = (name: string) => {
  const root = `node_modules/${name}`
  const { license, version } = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))
  const file = readdirSync(root).find(file => /^licen[cs]e/i.test(file))
  return `\n## ${name} - ${version} (${license})\n\n${readFileSync(`${root}/${file}`, 'utf8')}`
}

/**
 * Appends the crates' notices at `notices` to the file Vite's `build.license`
 * writes as `fileName`, once Vite has written the packages' notices into it,
 * after the notice of each package in `copied` whose files the site copies
 * rather than bundles and which Vite has not listed. The build fails where
 * `notices` holds no notice for a crate the manifest at `manifest` lists under
 * its dependencies.
 */
export const licensesOf = (fileName: string, manifest: URL, notices: URL, copied: string[] = []): Plugin => ({
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
      const listed   = String(asset.source)
      const unlisted = copied.filter(name => !listed.includes(`\n## ${name} - `))
      asset.source   = listed + unlisted.map(noticeOf).join('') + text
    }
  }
})
