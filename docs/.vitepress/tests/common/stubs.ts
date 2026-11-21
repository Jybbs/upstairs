import { vi }              from 'vitest'
import { defineComponent } from 'vue'

/**
 * Builds a canvas of no size whose 2D context answers each call `calls` names,
 * takes every other call, and holds every property set on it. Unless `calls`
 * names them, a gradient takes its stops and text measures 7 pixels a letter,
 * 8 above its baseline and 2 below.
 */
export const canvasWith = (calls: Record<string, unknown>) => {
  const base    = {
    canvas               : { height: 0, width: 0 },
    createRadialGradient : () => ({ addColorStop: () => {} }),
    measureText          : (text: string) =>
      ({ actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, width: 7 * text.length })
  }
  const context = new Proxy<Record<string | symbol, unknown>>({ ...base, ...calls }, {
    get: (target, key) => target[key] ?? (() => {})
  })
  return { canvas: { getContext: () => context } as unknown as HTMLCanvasElement, context }
}

/**
 * Stands in for `Path2D` and for the 2D context of every canvas, a context
 * taking every call.
 */
export const stubCanvas = () => {
  vi.stubGlobal('Path2D', class {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasWith({}).context as never)
}

/**
 * Stands in for `matchMedia`, answering each query with what `matching` returns
 * for it and taking listeners it never calls.
 */
export const stubMatchMedia = (matching: (query: string) => boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener() {}, matches: matching(query), removeEventListener() {}
  }))

/**
 * Stands in for the module of the theme component `name`, exporting a
 * component of that name that renders nothing, for a suite that stubs the
 * component wherever it mounts it.
 */
export const stubOf = (name: string) => ({ default: defineComponent({ name, render: () => null }) })
