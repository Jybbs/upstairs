import { vi } from 'vitest'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * The answers Space-Track gives an accepted login, setting two cookies, a
 * rejected login, and a logout.
 */
export const ACCEPTED = () => new Response('""', {
  headers: [
    ['set-cookie', 'chocolatechip=abc; path=/; secure'], ['set-cookie', 'spacetrack_csrf_cookie=def; path=/']
  ]
})
export const LOGGED   = () => new Response('')
export const REJECTED = () => new Response('{"Login":"Failed"}')

/**
 * Stands in for `fetch`, answering each request with the next of `answers`,
 * where an answer that throws stands for a request that reached no server.
 * A call with any `this` but `undefined` or `globalThis` throws the `TypeError`
 * the Workers runtime throws for it.
 */
export const answering = (...answers: (() => Response)[]) => {
  const queue = [...answers]
  return vi.fn<Fetch>(async function (this: unknown) {
    if (this !== undefined && this !== globalThis)
      throw new TypeError('Illegal invocation: function called with incorrect this reference')
    return queue.shift()!()
  })
}
