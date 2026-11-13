import { vi } from 'vitest'

import { TRACK_WIDTH, type Pass } from '../../lib/orbit/scan.ts'
import type { sky as Sky }        from '../../lib/state/sky.ts'

/**
 * Adds `passes` to the scan the shared state holds, every one reading the same
 * zeroed sample, and bumps `version` so `rows` recomputes over them.
 */
export const addScanned = (sky: typeof Sky, passes: Pass[]) => {
  sky.tracks.add(passes, new Float32Array(TRACK_WIDTH), new Uint32Array(passes.length), 1)
  sky.version.value++
}

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

/**
 * Loads a fresh copy of the shared state as `freshSky` does, in New York's
 * time zone, with the window opening at 11:47 PM on Tuesday, November 10,
 * 2026.
 */
export const lateSky = async <T>(load: () => Promise<{ default: T }>) => {
  vi.stubEnv('TZ', 'America/New_York')
  const fresh           = await freshSky(load)
  fresh.sky.start.value = new Date(2026, 10, 10, 23, 47).getTime()
  return fresh
}
