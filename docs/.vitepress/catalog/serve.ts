/**
 * Serves the catalog file from the edge cache or Workers KV, and answers a
 * request to the resume path carrying the resume token with the stored halt,
 * clearing it where the request is a `POST`.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

import { FILE } from '../lib/orbit/catalog.ts'

/**
 * The halt of the download cycle, read through `halt` and cleared through
 * `resume`, each returning the halt or `undefined` while the cycle runs.
 */
interface Halts {
  halt   : () => Promise<object | undefined>
  resume : () => Promise<object | undefined>
}

export interface Served {
  CATALOG       : Pick<KVNamespace, 'get'>
  RESUME_TOKEN? : string
}

export const HEADERS = {
  'cache-control' : 'public, max-age=3600, stale-while-revalidate=7200',
  'content-type'  : 'application/octet-stream'
}
/**
 * The path that reads the stored halt and clears it.
 */
export const RESUME = '/catalog/resume'
/**
 * The answer on the resume path while the cycle has not halted.
 */
export const RUNNING = { running: true }

const hashOf = (text: string) =>
  createHash('sha256')
    .update(text)
    .digest()

const authorized = (request: Request, token?: string) =>
  !!token && timingSafeEqual(hashOf(request.headers.get('authorization') ?? ''), hashOf(`Bearer ${token}`))

/**
 * Answers a request for the catalog from the edge cache or else from Workers KV,
 * and a `GET` or `POST` to the resume path carrying the resume token with the
 * stored halt, or with `RUNNING` where the cycle has not halted. A `POST` also
 * clears the halt it answers with.
 */
export const serve = async (
  cache   : Pick<Cache, 'match' | 'put'>,
  halts   : Halts,
  env     : Served,
  request : Request,
  later   : (promise: Promise<unknown>) => void
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
  if (pathname === RESUME && (request.method === 'GET' || request.method === 'POST')) {
    if (!authorized(request, env.RESUME_TOKEN)) return new Response(null, { status: 401 })
    return Response.json(await (request.method === 'GET' ? halts.halt() : halts.resume()) ?? RUNNING)
  }
  return new Response(null, { status: 404 })
}
