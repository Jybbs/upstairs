import { describe, expect, it, vi } from 'vitest'

import { HEADERS, RESUME, serve } from '../../catalog/serve.ts'
import { FILE } from '../../src/orbit/catalog.ts'

const TOKEN = 'resume-token'
const file  = new Uint8Array([1, 2, 3])

const MISROUTED = [['GET', RESUME], ['POST', `/${FILE}`], ['GET', '/']] as const

const serving = (stored: Uint8Array | null, cached?: Response, token: string | undefined = TOKEN) => {
  const put    = vi.fn(async () => {})
  const later  = vi.fn()
  const resume = vi.fn(async () => {})
  const get    = vi.fn(async () => stored?.buffer ?? null)
  const answer = (path: string, init?: RequestInit) => serve(
    { match: async () => cached, put },
    { CATALOG: { get } as unknown as Pick<KVNamespace, 'get'>, RESUME_TOKEN: token },
    new Request(`https://upstairs.fyi${path}`, init),
    later,
    resume
  )
  return { answer, get, put, later, resume }
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
    expect(put).toHaveBeenCalledOnce()
    expect(later).toHaveBeenCalledOnce()
  })

  it('answers 503 before the first catalog is stored', async () => {
    expect((await serving(null).answer(`/${FILE}`)).status).toBe(503)
  })

  it.each([
    ['the token', { authorization: `Bearer ${TOKEN}` }, 204, 1],
    ['another token', { authorization: 'Bearer guess' }, 401, 0],
    ['no token', {}, 401, 0]
  ] as const)('answers a resume carrying %s with %i', async (_, headers, status, resumed) => {
    const { answer, resume } = serving(file)
    const response = await answer(RESUME, { method: 'POST', headers })
    expect(response.status).toBe(status)
    expect(resume).toHaveBeenCalledTimes(resumed)
  })

  it('answers a resume with 401 while no resume token is set', async () => {
    const { answer, resume } = serving(file, undefined, undefined)
    const headers  = { authorization: 'Bearer undefined' }
    const response = await answer(RESUME, { method: 'POST', headers })
    expect(response.status).toBe(401)
    expect(resume).not.toHaveBeenCalled()
  })

  it.each(MISROUTED)('answers %s %s with 404', async (method, path) => {
    expect((await serving(file).answer(path, { method })).status).toBe(404)
  })
})
