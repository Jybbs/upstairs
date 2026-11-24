import type { TransformContext } from 'vitepress'
import { describe, expect, it }  from 'vitest'

import { preloadOf } from '../../../../docs/.vitepress/lib/site/preload.ts'

type Generate = (options: object, bundle: object) => void

/**
 * A client bundle whose home chunk imports the map's chunk, which imports the
 * framework's chunk.
 */
const BUNDLE = {
  'assets/style.def.css': { fileName: 'assets/style.def.css', type: 'asset' },

  'assets/chunks/HomeMap.abc.js': {
    facadeModuleId : '/site/.vitepress/theme/HomeMap.tsx',
    fileName       : 'assets/chunks/HomeMap.abc.js',
    imports        : ['assets/chunks/maplibre.ghi.js'],
    type           : 'chunk'
  },

  'assets/chunks/framework.jkl.js': {
    fileName : 'assets/chunks/framework.jkl.js',
    imports  : [],
    type     : 'chunk'
  },

  'assets/chunks/maplibre.ghi.js': {
    fileName : 'assets/chunks/maplibre.ghi.js',
    imports  : ['assets/chunks/framework.jkl.js'],
    type     : 'chunk'
  }
}

const built = () => {
  const preload  = preloadOf('/theme/HomeMap.tsx', 'index.md', ['/maplibre-gl/maplibre-gl.css?v=1'])
  const generate = preload.plugin.generateBundle as Generate
  generate.call({}, {}, BUNDLE)
  return preload
}
const contextOf = (page: string) => ({ page, siteData: { base: '/' } }) as TransformContext

describe('the preload', () => {
  it('links the chunk the component builds into, each chunk it imports, and each sheet it names, '
   + 'from the page it names', () =>
    expect(built().head(contextOf('index.md'))).toEqual([
      ['link', { href: '/assets/chunks/HomeMap.abc.js', rel: 'modulepreload' }],
      ['link', { href: '/assets/chunks/maplibre.ghi.js', rel: 'modulepreload' }],
      ['link', { href: '/assets/chunks/framework.jkl.js', rel: 'modulepreload' }],
      ['link', { as: 'style', href: '/maplibre-gl/maplibre-gl.css?v=1', rel: 'preload' }]
    ]))
  it.each(['guide/index.md', '404.md'])('adds nothing to %s', page =>
    expect(built().head(contextOf(page))).toEqual([]))
  it('fails the build where no chunk of the bundle builds from the component', () => {
    const generate = preloadOf('/theme/Missing.tsx', 'index.md').plugin.generateBundle as Generate
    const context  = { error: (message: string) => { throw new Error(message) } }
    expect(() => generate.call(context, {}, BUNDLE)).toThrow('/theme/Missing.tsx')
  })
  it('adds nothing before the client bundle names the chunk', () =>
    expect(preloadOf('/theme/HomeMap.tsx', 'index.md').head(contextOf('index.md'))).toEqual([]))
  it.each([['client', true], ['ssr', false]])('runs in the %s build: %s', (name, runs) =>
    expect((built().plugin.applyToEnvironment as (environment: object) => boolean)({ name })).toBe(runs))
})
