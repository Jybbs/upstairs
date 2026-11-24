import { unbound } from './fetchers.ts'

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
 * Answers with a body that sends `sent` and then fails with `error`.
 */
export const stopping = (sent: string, error: Error, init?: ResponseInit) => () => {
  const chunks = [sent].filter(Boolean).map(text => new TextEncoder().encode(text))
  return new Response(new ReadableStream({
    pull: controller => {
      const chunk = chunks.shift()
      if (chunk) controller.enqueue(chunk)
      else controller.error(error)
    }
  }), init)
}

/**
 * Stands in for `fetch` as `unbound` does, answering each request with the
 * next of `answers`, where an answer that throws stands for a request that
 * reached no server.
 */
export const answering = (...answers: (() => Response)[]) => {
  const queue = [...answers]
  return unbound(async () => queue.shift()!())
}
