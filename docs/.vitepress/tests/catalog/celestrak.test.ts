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
    ['a connection that fails to open', new TypeError('Network connection lost'), true],
    ['a wait for headers past the bound', new DOMException('No answer within', 'TimeoutError'), false]
  ])('tells %s apart as unreachable or not', async (_, error, unreachable) => {
    const failure = await celestrak.download(Promise.reject(error)).catch((thrown: unknown) => thrown)
    expect(failure instanceof celestrak.Unreachable).toBe(unreachable)
  })
})
