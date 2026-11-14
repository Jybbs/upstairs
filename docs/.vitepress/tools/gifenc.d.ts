/**
 * Declares the `gifenc` exports `reel.ts` calls, which the package ships with
 * no type declarations of its own.
 */
declare module 'gifenc' {
  export interface GifEncoder {
    bytes      : () => Uint8Array
    finish     : () => void
    writeFrame : (index: Uint8Array, width: number, height: number, options?: GifFrame) => void
  }

  export interface GifFrame {
    delay?            : number
    dispose?          : number
    palette?          : GifPalette
    transparent?      : boolean
    transparentIndex? : number
  }

  export type GifPalette = number[][]

  export const GIFEncoder   : () => GifEncoder
  export const applyPalette : (rgba: Uint8Array, palette: GifPalette) => Uint8Array
  export const quantize     : (rgba: Uint8Array, colors: number) => GifPalette
}
