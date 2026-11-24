import { vi } from 'vitest'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * The error a request or a body fails with where the connection is lost.
 */
export const LOST = new TypeError('Network connection lost')

/**
 * Answers with a body that sends `sent` and then fails with `error`.
 */
export const stopping = (sent: string, error: Error, init?: ResponseInit) => () => {
  const chunks = sent ? [new TextEncoder().encode(sent)] : []
  return new Response(new ReadableStream({
    pull: controller => {
      const chunk = chunks.shift()
      if (chunk) controller.enqueue(chunk)
      else controller.error(error)
    }
  }), init)
}

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
