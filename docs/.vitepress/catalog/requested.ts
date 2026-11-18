/**
 * Runs one cycle for a `POST` to the run path carrying the token the catalog
 * service holds as its secret, leaving every other request to `serve`.
 */

/**
 * The secret holding the token of the run path.
 */
export type Requested = { [name in typeof SECRET]?: string }

/**
 * The path a request runs one cycle at.
 */
export const RUN_PATH = '/catalog/run'
/**
 * The name the catalog service reads the token of the run path under.
 */
export const SECRET   = 'RUN_TOKEN'

/**
 * Returns whether `request` carries `token` as its bearer token, comparing the
 * SHA-256 digests of the two through `crypto.subtle.timingSafeEqual`, which
 * takes inputs of one length and compares them in constant time, per
 * https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/.
 */
const authorized = async (request: Request, token?: string) => {
  if (!token) return false
  const [sent, held] = await Promise.all([digestOf(request.headers.get('authorization') ?? ''),
    digestOf(`Bearer ${token}`)])
  return crypto.subtle.timingSafeEqual(sent, held)
}

const digestOf = (text: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))

/**
 * Answers a `POST` to `RUN_PATH` carrying the token `env` holds with the
 * outcome of `run` as JSON, returning `undefined` for every other request.
 */
export const requested = async (env: Requested, request: Request, run: () => Promise<unknown>) =>
     new URL(request.url).pathname === RUN_PATH && request.method === 'POST'
  && await authorized(request, env[SECRET])
    ? Response.json(await run())
    : undefined
