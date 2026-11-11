import { readFile }      from 'node:fs/promises'
import { createRequire } from 'node:module'

import { create, type Font } from 'fontkit'
import { decompress }        from 'woff2-encoder'

/**
 * The faces a card sets its words in, by the name the site gives each.
 */
export type Faces = Record<keyof typeof FACES, Face>

/**
 * A run of text in one of the site's faces, laid out at a size in pixels with
 * its tracking as a share of that size.
 */
export interface Setting {
  size      : number
  text      : string
  tracking? : number
}

/**
 * The Fontsource package, the cut, and the fixed axes of each face the cards
 * set, the optical size of a variable face following the size it is set at.
 */
const FACES = {
  book    : { axes: { wght: 400 }, cut: 'opsz', font: '@fontsource-variable/newsreader' },
  display : { axes: {},            cut: '700',  font: '@fontsource/averia-serif-libre' },
  mono    : { axes: { wght: 500 }, cut: 'wght', font: '@fontsource-variable/jetbrains-mono' }
} as const

/**
 * One of the site's faces, read from the Fontsource package the site loads it
 * from and decompressed, since `fontkit` sets a variable face only from a
 * TrueType file.
 */
export class Face {
  private readonly instances = new Map<number, Font>()

  private constructor(private readonly axes: Readonly<Record<string, number>>, private readonly font: Font) {}

  /**
   * Reads the face the site names `name`.
   */
  static async read(name: keyof typeof FACES) {
    const { axes, cut, font } = FACES[name]
    const file                = `${font}/files/${font.split('/')[1]}-latin-${cut}-normal.woff2`
    const woff2               = await readFile(createRequire(import.meta.url).resolve(file))
    return new Face(axes, create(Buffer.from(await decompress(woff2))) as Font)
  }

  /**
   * Reads every face the cards set.
   */
  static async faces() {
    const names = Object.keys(FACES) as (keyof typeof FACES)[]
    const faces = await Promise.all(names.map(async name => [name, await Face.read(name)]))
    return Object.fromEntries(faces) as Faces
  }

  /**
   * Returns how far below the top of a line box `leading` times `size` tall
   * the face's baseline sits, as a browser centers the face's ascent and
   * descent in the box.
   */
  baselineOf(size: number, leading: number) {
    const { ascent, descent, unitsPerEm } = this.font
    return (leading * size - (ascent - descent) * size / unitsPerEm) / 2 + ascent * size / unitsPerEm
  }

  /**
   * Returns the outline of `setting` as path data, its baseline starting at
   * `x`, `y`, with the face's own kerning and the setting's tracking after
   * every letter.
   */
  outline({ size, text, tracking = 0 }: Setting, x: number, y: number) {
    const scale = size / this.font.unitsPerEm
    const run   = this.instanceAt(size).layout(text)
    let pen     = x
    return run.glyphs.map((glyph, i) => {
      const at = run.positions[i]
      const d  = glyph.path.scale(scale, -scale)
        .translate(pen + at.xOffset * scale, y - at.yOffset * scale)
        .toSVG()
      pen     += at.xAdvance * scale + tracking * size
      return d
    }).join('')
  }

  /**
   * Returns the outline of `setting` as `outline` sets it, its last letter's
   * advance ending at `right`.
   */
  outlineTo(setting: Setting, right: number, y: number) {
    return this.outline(setting, right - this.widthOf(setting), y)
  }

  /**
   * Returns the width `setting` takes, its tracking after every letter
   * included.
   */
  widthOf({ size, text, tracking = 0 }: Setting) {
    const run = this.instanceAt(size).layout(text)
    return run.advanceWidth * size / this.font.unitsPerEm + run.glyphs.length * tracking * size
  }

  private instanceAt(size: number) {
    if (!Object.keys(this.font.variationAxes).length) return this.font
    const sized = 'opsz' in this.font.variationAxes ? { ...this.axes, opsz: size } : this.axes
    if (!this.instances.has(size)) this.instances.set(size, this.font.getVariation(sized))
    return this.instances.get(size)!
  }
}
