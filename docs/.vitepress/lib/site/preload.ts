import type { HeadConfig, Plugin, TransformContext } from 'vitepress'

/**
 * Preloads the chunk a component builds into from the head of one page, since
 * the theme imports that component only once the page mounts. The plugin reads
 * the chunk's name from the client bundle, failing the build where no chunk
 * builds from the component, and `head` adds the link to `page`.
 */
export const preloadOf = (component: string, page: string) => {
  let file           = ''
  const plugin: Plugin = {
    applyToEnvironment : ({ name }) => name === 'client',
    name               : 'upstairs:preload',
    generateBundle(_, bundle) {
      const chunk = Object.values(bundle)
        .find(chunk => chunk.type === 'chunk' && chunk.facadeModuleId?.endsWith(component))
      if (chunk?.type !== 'chunk') this.error(`No chunk of the client bundle builds from ${component}`)
      file = chunk.fileName
    }
  }
  const head = (context: TransformContext): HeadConfig[] => context.page === page && file
    ? [['link', { href: context.siteData.base + file, rel: 'modulepreload' }]]
    : []
  return { head, plugin }
}
