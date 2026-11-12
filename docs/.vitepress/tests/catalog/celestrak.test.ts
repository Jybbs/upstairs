import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as celestrak from '../../catalog/celestrak.ts'

const signalOf = (fetcher: ReturnType<typeof vi.fn>) => (fetcher.mock.calls[0][1] as RequestInit).signal!

describe('a catalog request', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it.each([
    ['the abort reason', (signal: AbortSignal) => signal.reason],
    ['an error of its own', () => new DOMException('The operation was aborted', 'AbortError')]
  ])('aborts once no headers arrive within the bound, and not a millisecond sooner, when fetch '
   + 'rejects with %s', async (_, rejection) => {
    const fetcher = vi.fn((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) =>
      init!.signal!.addEventListener('abort', () => reject(rejection(init!.signal!)))))
    const sent    = celestrak.fetchCatalog(fetcher)
    const failure = expect(sent).rejects.toMatchObject({
      message : `No answer within ${celestrak.HEADER_WAIT} ms`,
      name    : 'TimeoutError'
    })
    await vi.advanceTimersByTimeAsync(celestrak.HEADER_WAIT - 1)
    expect(signalOf(fetcher).aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await failure
  })

  it('waits for headers past the 19 seconds Cloudflare waits for a connection before answering 522', () => {
    expect(celestrak.HEADER_WAIT).toBeGreaterThan(19_000)
  })

  it('leaves an answer whose headers arrived unaborted past the bound', async () => {
    const fetcher = vi.fn(async () => new Response('[]'))
    const answer  = await celestrak.fetchCatalog(fetcher)
    await vi.advanceTimersByTimeAsync(2 * celestrak.HEADER_WAIT)
    expect(signalOf(fetcher).aborted).toBe(false)
    expect(await answer.text()).toBe('[]')
  })
})

describe('a download', () => {
  it('cancels the body of a 522 before failing as unreachable', async () => {
    const cancel = vi.fn()
    const answer = new Response(new ReadableStream({ cancel }), { status: 522 })
    await expect(celestrak.download(Promise.resolve(answer))).rejects.toThrow(celestrak.Unreachable)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each([
    ['a connection that fails to open', new TypeError('Network connection lost'), celestrak.Unreachable],
    ['a wait for headers past the bound', new DOMException('No answer', 'TimeoutError'), celestrak.Failed]
  ])('tells %s apart as unreachable or failed', async (_, error, kind) => {
    await expect(celestrak.download(Promise.reject(error))).rejects.toBeInstanceOf(kind)
  })

  it('keeps the status, the kept headers alone, and the whole of a short body of a refusal', async () => {
    const kept   = Object.fromEntries(celestrak.KEPT.map(name => [name, `${name} value`]))
    const answer = new Response('Access denied', { status: 403, headers: { ...kept, server: 'nginx' } })
    await expect(celestrak.download(Promise.resolve(answer))).rejects.toMatchObject({
      failure: {
        body    : 'Access denied',
        headers : kept,
        kind    : 'refused',
        reason  : 'CelesTrak answered 403',
        status  : 403
      }
    })
  })

  it('keeps an empty body of a refusal that carries none', async () => {
    const answer = new Response(null, { status: 304 })
    await expect(celestrak.download(Promise.resolve(answer))).rejects.toMatchObject({
      failure: { body: '', kind: 'refused', status: 304 }
    })
  })

  it('keeps the first characters of a long refusal and cancels the rest of its body', async () => {
    const cancel = vi.fn()
    const body   = new ReadableStream({
      cancel : cancel,
      pull   : controller => controller.enqueue(new TextEncoder().encode('x'.repeat(1000)))
    })
    const failure = await celestrak.download(Promise.resolve(new Response(body, { status: 429 })))
      .catch((error: celestrak.Failed) => error.failure)
    expect(failure).toMatchObject({ body: 'x'.repeat(celestrak.EXCERPT), status: 429 })
    expect(cancel).toHaveBeenCalledOnce()
  })
})
