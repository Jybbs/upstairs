import { describe, expect, it, vi } from 'vitest'

import { HEADERS, RESUME, RUNNING, serve } from '../../catalog/serve.ts'
import { FILE }                            from '../../lib/orbit/catalog.ts'

const HALT  = { event: 'catalog.halted', kind: 'refused', reason: 'CelesTrak answered 403', status: 403 }
const TOKEN = 'resume-token'
const file  = new Uint8Array([1, 2, 3])

const MISROUTED = [['PUT', RESUME], ['POST', `/${FILE}`], ['GET', '/']] as const

const serving = (
  stored  : Uint8Array | null,
  cached? : Response,
  halt?   : object,
  token   : string | undefined = TOKEN
) => {
  const put    = vi.fn(async () => {})
  const later  = vi.fn()
  const halts  = { halt: vi.fn(async () => halt), resume: vi.fn(async () => halt) }
  const get    = vi.fn(async () => stored?.buffer ?? null)
  const answer = (path: string, init?: RequestInit) => serve(
    { match: async () => cached, put },
    halts,
    { CATALOG: { get } as unknown as Pick<KVNamespace, 'get'>, RESUME_TOKEN: token },
    new Request(`https://upstairs.fyi${path}`, init),
    later
  )
  return { answer, get, halts, later, put }
}

describe('serving the catalog', () => {
  it('answers from the edge cache without reading KV', async () => {
    const { answer, get } = serving(file, new Response('cached'))
    expect(await (await answer(`/${FILE}`)).text()).toBe('cached')
    expect(get).not.toHaveBeenCalled()
  })

  it('reads KV on a miss and caches what it answers', async () => {
    const { answer, put, later } = serving(file)
    const response = await answer(`/${FILE}`)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(file)
    const headers = Object.fromEntries(Object.keys(HEADERS).map(name => [name, response.headers.get(name)]))
    expect(headers).toEqual(HEADERS)
    expect(response.headers.get('cache-control')).toMatch(/stale-while-revalidate=\d+/)
    expect(put).toHaveBeenCalledOnce()
    expect(later).toHaveBeenCalledOnce()
  })

  it('answers 503 before the first catalog is stored', async () => {
    expect((await serving(null).answer(`/${FILE}`)).status).toBe(503)
  })

  it.each([
    ['GET', 'halt', 'resume', HALT],
    ['POST', 'resume', 'halt', HALT],
    ['GET', 'halt', 'resume', undefined],
    ['POST', 'resume', 'halt', undefined]
  ] as const)('answers a %s to the resume path through %s with the halt, or RUNNING with none stored',
    async (method, called, untouched, halt) => {
      const { answer, halts } = serving(file, undefined, halt)
      const response = await answer(RESUME, { method, headers: { authorization: `Bearer ${TOKEN}` } })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(halt ?? RUNNING)
      expect(halts[called]).toHaveBeenCalledOnce()
      expect(halts[untouched]).not.toHaveBeenCalled()
    })

  it.each([
    ['the token', { authorization: `Bearer ${TOKEN}` }, 200, 1],
    ['another token', { authorization: 'Bearer guess' }, 401, 0],
    ['no token', {}, 401, 0]
  ] as const)('answers a resume carrying %s with %i', async (_, headers, status, resumed) => {
    const { answer, halts } = serving(file)
    const response = await answer(RESUME, { method: 'POST', headers })
    expect(response.status).toBe(status)
    expect(halts.resume).toHaveBeenCalledTimes(resumed)
  })

  it.each(['GET', 'POST'])('answers a %s to the resume path with 401 while no resume token is set',
    async method => {
      const { answer, halts } = serving(file, undefined, HALT, undefined)
      const headers  = { authorization: 'Bearer undefined' }
      const response = await answer(RESUME, { method, headers })
      expect(response.status).toBe(401)
      expect(halts.halt).not.toHaveBeenCalled()
      expect(halts.resume).not.toHaveBeenCalled()
    })

  it.each(MISROUTED)('answers %s %s with 404', async (method, path) => {
    expect((await serving(file).answer(path, { method })).status).toBe(404)
  })
})
