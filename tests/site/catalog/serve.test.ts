import { describe, expect, it, vi } from 'vitest'

import { HEADERS, serve } from '../../catalog/serve.ts'
import { FILE }          from '../../lib/orbit/catalog.ts'

const file = new Uint8Array([1, 2, 3])

const MISROUTED = [['POST', `/${FILE}`], ['GET', '/'], ['POST', '/catalog/resume']] as const

const serving = (stored: Uint8Array | null, cached?: Response) => {
  const put    = vi.fn(async () => {})
  const later  = vi.fn()
  const get    = vi.fn(async () => stored?.buffer ?? null)
  const answer = (path: string, init?: RequestInit) => serve(
    { match: async () => cached, put },
    { CATALOG: { get } as unknown as Pick<KVNamespace, 'get'> },
    new Request(`https://upstairs.fyi${path}`, init),
    later
  )
  return { answer, get, later, put }
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

  it.each(MISROUTED)('answers %s %s with 404', async (method, path) => {
    expect((await serving(file).answer(path, { method })).status).toBe(404)
  })
})
