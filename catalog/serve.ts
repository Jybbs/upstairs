/**
 * Serves the catalog file from the edge cache or Workers KV, and clears a halted
 * cycle on a resume request carrying the resume token.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

import { FILE } from '../src/orbit/catalog.ts'

/**
 * The path that clears a halted cycle.
 */
export const RESUME = '/catalog/resume'

export const HEADERS = {
  'cache-control' : 'public, max-age=3600, stale-while-revalidate=7200',
  'content-type'  : 'application/octet-stream'
}

export interface Served {
  CATALOG       : Pick<KVNamespace, 'get'>
  RESUME_TOKEN? : string
}

const hashOf = (text: string) =>
  createHash('sha256')
    .update(text)
    .digest()

const authorized = (request: Request, token?: string) =>
  !!token && timingSafeEqual(hashOf(request.headers.get('authorization') ?? ''), hashOf(`Bearer ${token}`))

/**
 * Answers a request for the catalog from the edge cache or else from Workers KV,
 * and a resume request carrying the resume token by clearing the halt.
 */
export const serve = async (
  cache   : Pick<Cache, 'match' | 'put'>,
  env     : Served,
  request : Request,
  later   : (promise: Promise<unknown>) => void,
  resume  : () => Promise<void>
): Promise<Response> => {
  const { pathname } = new URL(request.url)
  if (pathname === `/${FILE}` && request.method === 'GET') {
    const cached = await cache.match(request)
    if (cached) return cached
    const file = await env.CATALOG.get(FILE, 'arrayBuffer')
    if (!file) return new Response('No catalog is stored yet', { status: 503 })
    const response = new Response(file, { headers: HEADERS })
    later(cache.put(request, response.clone()))
    return response
  }
  if (pathname === RESUME && request.method === 'POST') {
    if (!authorized(request, env.RESUME_TOKEN)) return new Response(null, { status: 401 })
    await resume()
    return new Response(null, { status: 204 })
  }
  return new Response(null, { status: 404 })
}
