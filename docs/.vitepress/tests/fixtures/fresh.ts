import { vi } from 'vitest'

const held: unknown[] = []

/**
 * Clears the module cache and returns what `load` imports afresh, holding each
 * copy until the test file ends, because the coverage report drops the counts
 * of a copy collected as garbage before the report is taken.
 */
export const fresh = async <T>(load: () => Promise<T>): Promise<T> => {
  vi.resetModules()
  const modules = await load()
  held.push(modules)
  return modules
}
