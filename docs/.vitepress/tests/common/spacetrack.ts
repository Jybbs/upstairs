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
 */
export const answering = (...answers: (() => Response)[]) => {
  const queue = [...answers]
  return vi.fn<Fetch>(async () => queue.shift()!())
}
