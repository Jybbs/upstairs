import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as celestrak from '../../catalog/celestrak.ts'

const signalOf = (fetcher: ReturnType<typeof vi.fn>) => (fetcher.mock.calls[0][1] as RequestInit).signal!

describe('a catalog request', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('aborts once no headers arrive within the bound, and not a millisecond sooner', async () => {
    const fetcher = vi.fn((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) =>
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))))
    const sent    = celestrak.fetchCatalog(fetcher)
    const failure = expect(sent).rejects.toThrow(`No answer within ${celestrak.CONNECT} ms`)
    await vi.advanceTimersByTimeAsync(celestrak.CONNECT - 1)
    expect(signalOf(fetcher).aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await failure
  })

  it('leaves an answer whose headers arrived unaborted past the bound', async () => {
    const fetcher = vi.fn(async () => new Response('[]'))
    const answer  = await celestrak.fetchCatalog(fetcher)
    await vi.advanceTimersByTimeAsync(2 * celestrak.CONNECT)
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
})
