import { vi } from 'vitest'

/**
 * Loads a fresh copy of the shared state over a stand-in worker, then the
 * component `load` imports beside it.
 */
export const freshSky = async <T>(load: () => Promise<{ default: T }>) => {
  vi.stubGlobal('Worker', class { postMessage() {} })
  vi.resetModules()
  const { sky }                = await import('../../lib/state/sky.ts')
  const { default: component } = await load()
  return { component, sky }
}
