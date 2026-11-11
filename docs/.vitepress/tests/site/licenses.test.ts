import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { licensesOf } from '../../lib/site/licenses.ts'

type Generate = (options: object, bundle: object) => void

const KATEX    = JSON.parse(readFileSync('node_modules/katex/package.json', 'utf8'))
const MANIFEST = new URL('../../../../rust/Cargo.toml', import.meta.url)
const PACKAGES = '# Licenses\n\n## vue - 3.5.0 (MIT)\n'

const bundleOf = (source: string) => ({ 'licenses.txt': { source, type: 'asset' } })
const context  = { error: (message: string) => { throw new Error(message) } }
const fixture  = (name: string) => new URL(`../fixtures/${name}`, import.meta.url)
const plugin   = (notices: string, copied?: string[]) =>
  licensesOf('licenses.txt', MANIFEST, fixture(notices), copied)
const generate = (notices: string, bundle: object, copied?: string[]) =>
  (plugin(notices, copied).generateBundle as { handler: Generate }).handler.call(context, {}, bundle)

describe('the licenses', () => {
  it('appends the notice of each crate the manifest lists after the packages\' notices', () => {
    const bundle = bundleOf(PACKAGES)
    generate('notices.txt', bundle)
    expect(bundle['licenses.txt'].source).toBe(PACKAGES + readFileSync(fixture('notices.txt'), 'utf8'))
  })
  it('appends the notice of each copied package the packages\' notices leave out', () => {
    const bundle = bundleOf(PACKAGES)
    generate('notices.txt', bundle, ['katex', 'vue'])
    const katex = `\n## katex - ${KATEX.version} (MIT)\n\n${readFileSync('node_modules/katex/LICENSE', 'utf8')}`
    expect(bundle['licenses.txt'].source).toBe(PACKAGES + katex + readFileSync(fixture('notices.txt'), 'utf8'))
  })
  it('fails the build where the notices hold none for sgp4', () =>
    expect(() => generate('notices-without-sgp4.txt', bundleOf(''))).toThrow(/holds no notice for sgp4$/))
  it('fails the build where the client bundle holds no license file', () =>
    expect(() => generate('notices.txt', {})).toThrow('The client bundle holds no licenses.txt'))
  it.each([['client', true], ['ssr', false]])('runs in the %s build: %s', (name, runs) =>
    expect((plugin('notices.txt').applyToEnvironment as (environment: object) => boolean)({ name }))
      .toBe(runs))
})
