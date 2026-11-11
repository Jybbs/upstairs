/**
 * The stylesheet of a package that a page links on its own, the first of the
 * files the site copies from the package's `dist/` folder to the folder named
 * for the package, since VitePress links the first stylesheet of the bundle
 * from every page as the site's own.
 */
class Sheet {
  constructor(readonly files: string[], readonly name: string) {}

  /**
   * The copy the static-copy plugin makes of the sheet and the files it reads.
   */
  get copy() {
    return {
      dest   : this.name,
      rename : { stripBase: 3 },
      src    : this.files.map(file => `node_modules/${this.name}/dist/${file}`)
    }
  }

  /**
   * The address the site serves the sheet at.
   */
  get href() {
    return `/${this.name}/${this.files[0]}`
  }
}

/**
 * The sheet of each package a page links on its own.
 */
export const SHEETS = {
  katex : new Sheet(['katex.min.css', 'fonts/*'], 'katex'),
  map   : new Sheet(['maplibre-gl.css'], 'maplibre-gl')
}
