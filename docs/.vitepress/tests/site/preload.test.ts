import type { TransformContext } from 'vitepress'
import { describe, expect, it }  from 'vitest'

import { preloadOf } from '../../lib/site/preload.ts'

type Generate = (options: object, bundle: object) => void

const BUNDLE = {
  style : { fileName: 'assets/style.def.css', type: 'asset' },
  home  : {
    facadeModuleId : '/site/.vitepress/theme/HomeMap.vue',
    fileName       : 'assets/chunks/HomeMap.abc.js',
    type           : 'chunk'
  }
}

const built = () => {
  const preload  = preloadOf('/theme/HomeMap.vue', 'index.md')
  const generate = preload.plugin.generateBundle as Generate
  generate.call({}, {}, BUNDLE)
  return preload
}
const contextOf = (page: string) => ({ page, siteData: { base: '/' } }) as TransformContext

describe('the preload', () => {
  it('links the chunk the component builds into from the page it names', () =>
    expect(built().head(contextOf('index.md')))
      .toEqual([['link', { href: '/assets/chunks/HomeMap.abc.js', rel: 'modulepreload' }]]))
  it.each(['guide/index.md', '404.md'])('adds nothing to %s', page =>
    expect(built().head(contextOf(page))).toEqual([]))
  it('fails the build where no chunk of the bundle builds from the component', () => {
    const generate = preloadOf('/theme/Missing.vue', 'index.md').plugin.generateBundle as Generate
    const context  = { error: (message: string) => { throw new Error(message) } }
    expect(() => generate.call(context, {}, BUNDLE)).toThrow('/theme/Missing.vue')
  })
  it('adds nothing before the client bundle names the chunk', () =>
    expect(preloadOf('/theme/HomeMap.vue', 'index.md').head(contextOf('index.md'))).toEqual([]))
  it.each([['client', true], ['ssr', false]])('runs in the %s build: %s', (name, runs) =>
    expect((built().plugin.applyToEnvironment as (environment: object) => boolean)({ name })).toBe(runs))
})
