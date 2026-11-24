import { vi } from 'vitest'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * Stands in for `fetch` through `answer`, where a call with any `this` but
 * `undefined` or `globalThis` throws, before any answer, the `TypeError` the
 * Workers runtime throws for it.
 */
export const unbound = (answer: Fetch) => vi.fn<Fetch>(function (this: unknown, ...request) {
  if (this !== undefined && this !== globalThis)
    throw new TypeError('Illegal invocation: function called with incorrect this reference')
  return answer(...request)
})
