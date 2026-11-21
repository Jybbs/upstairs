import type { HeadConfig, Plugin, TransformContext } from 'vitepress'

/**
 * Preloads the chunk a component builds into from the head of one page, beside
 * every chunk it imports and each stylesheet at an address in `sheets`, since
 * the theme imports that component only once the page mounts. The plugin reads
 * the chunks from the client bundle, failing the build where no chunk builds
 * from the component, and `head` adds the links to `page`.
 */
export const preloadOf = (component: string, page: string, sheets: readonly string[] = []) => {
  const modules        = new Set<string>()
  const plugin: Plugin = {
    applyToEnvironment : ({ name }) => name === 'client',
    name               : 'upstairs:preload',
    generateBundle(_, bundle) {
      const chunk = Object.values(bundle)
        .find(chunk => chunk.type === 'chunk' && chunk.facadeModuleId?.endsWith(component))
      if (chunk?.type !== 'chunk') this.error(`No chunk of the client bundle builds from ${component}`)
      modules.add(chunk.fileName)
      for (const file of modules) {
        const each = bundle[file]
        if (each?.type !== 'chunk') continue
        for (const imported of each.imports) modules.add(imported)
      }
    }
  }
  const head = ({ page: at, siteData: { base } }: TransformContext): HeadConfig[] => at === page ? [
    ...[...modules].map((file): HeadConfig => ['link', { href: base + file, rel: 'modulepreload' }]),
    ...sheets.map((href): HeadConfig => ['link', { as: 'style', href, rel: 'preload' }])
  ] : []
  return { head, plugin }
}
