/**
 * Serves the catalog file from the edge cache or Workers KV.
 */
import { FILE } from '../lib/orbit/catalog.ts'

export interface Served {
  CATALOG: Pick<KVNamespace, 'get'>
}

export const HEADERS = {
  'cache-control' : 'public, max-age=3600, stale-while-revalidate=7200',
  'content-type'  : 'application/octet-stream'
}

/**
 * Answers a `GET` for the catalog from the edge cache or else from Workers KV,
 * with 503 while Workers KV holds none, and every other request with 404.
 */
export const serve = async (
  cache   : Pick<Cache, 'match' | 'put'>,
  env     : Served,
  request : Request,
  later   : (promise: Promise<unknown>) => void
): Promise<Response> => {
  if (new URL(request.url).pathname !== `/${FILE}` || request.method !== 'GET')
    return new Response(null, { status: 404 })
  const cached = await cache.match(request)
  if (cached) return cached
  const file = await env.CATALOG.get(FILE, 'arrayBuffer')
  if (!file) return new Response('No catalog is stored yet', { status: 503 })
  const response = new Response(file, { headers: HEADERS })
  later(cache.put(request, response.clone()))
  return response
}
