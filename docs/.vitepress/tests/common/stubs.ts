import { vi }              from 'vitest'
import { defineComponent } from 'vue'

/**
 * Stands in for the module of the theme component `name`, exporting a
 * component of that name that renders nothing, for a suite that stubs the
 * component wherever it mounts it.
 */
export const stubOf = (name: string) => ({ default: defineComponent({ name, render: () => null }) })

/**
 * Stands in for `matchMedia`, answering each query with what `matching` returns
 * for it and taking listeners it never calls.
 */
export const stubMatchMedia = (matching: (query: string) => boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener() {}, matches: matching(query), removeEventListener() {}
  }))
