import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as celestrak     from '../../catalog/celestrak.ts'
import { directoryBody, satcatBody, unchangedBody } from '../common/celestrak.ts'
import { unbound }        from '../common/fetchers.ts'

const UNCHANGED = unchangedBody('2026-11-15 21:21:36')
const SINCE     = '2026-11-15T21:21:36.000Z'

const read     = (body: string) => body

const signalOf = (fetcher: ReturnType<typeof vi.fn>) => (fetcher.mock.calls[0][1] as RequestInit).signal!

describe('a catalog request', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it.each([
    ['the abort reason', (signal: AbortSignal) => signal.reason],
    ['an error of its own', () => new DOMException('The operation was aborted', 'AbortError')]
  ])('aborts once no headers arrive within the bound, and not a millisecond sooner, when fetch '
   + 'rejects with %s', async (_, rejection) => {
    const fetcher = unbound((_, init) => new Promise<Response>((_, reject) =>
      init!.signal!.addEventListener('abort', () => reject(rejection(init!.signal!)))))
    const sent    = celestrak.fetchFrom(fetcher, celestrak.SATCAT)
    const failure = expect(sent).rejects.toMatchObject({
      message : `No answer within ${celestrak.HEADER_WAIT} ms`,
      name    : 'TimeoutError'
    })
    await vi.advanceTimersByTimeAsync(celestrak.HEADER_WAIT - 1)
    expect(signalOf(fetcher).aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await failure
  })

  it('leaves an answer whose headers arrived unaborted past the bound', async () => {
    const fetcher = unbound(async () => new Response('[]'))
    const answer  = await celestrak.fetchFrom(fetcher, celestrak.SATCAT)
    await vi.advanceTimersByTimeAsync(2 * celestrak.HEADER_WAIT)
    expect(signalOf(fetcher).aborted).toBe(false)
    expect(await answer.text()).toBe('[]')
  })
})

describe('a download', () => {
  it('cancels the body of a 522 before failing as unreachable', async () => {
    const cancel = vi.fn()
    const answer = new Response(new ReadableStream({ cancel }), { status: 522 })
    await expect(celestrak.download(Promise.resolve(answer), read)).rejects.toThrow(celestrak.Unreachable)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each([
    ['a connection that fails to open', new TypeError('Network connection lost'), celestrak.Unreachable],
    ['a wait for headers past the bound', new DOMException('No answer', 'TimeoutError'), celestrak.Failed]
  ])('tells %s apart as unreachable or failed', async (_, error, kind) => {
    await expect(celestrak.download(Promise.reject(error), read)).rejects.toBeInstanceOf(kind)
  })

  it('keeps the status, the kept headers alone, and the whole of a short body of a refusal', async () => {
    const kept   = Object.fromEntries(celestrak.KEPT.map(name => [name, `${name} value`]))
    const answer = new Response('Access denied', { status: 403, headers: { ...kept, server: 'nginx' } })
    await expect(celestrak.download(Promise.resolve(answer), read)).rejects.toMatchObject({
      failure: {
        body    : 'Access denied',
        headers : kept,
        kind    : 'refused',
        reason  : 'CelesTrak answered 403',
        status  : 403
      }
    })
  })

  it.each([
    [403, UNCHANGED, 'unchanged', SINCE],
    [403, UNCHANGED.replaceAll('\r\n', ' '), 'unchanged', SINCE],
    [403, `<p>${UNCHANGED.replaceAll('\r\n', '\n  ')}</p>`, 'unchanged', SINCE],
    [403, unchangedBody(''), 'unchanged', undefined],
    [403, unchangedBody('2026-13-45 21:21:36'), 'unchanged', undefined],
    [403, UNCHANGED.replace('GP', 'SATCAT'), 'unchanged', SINCE],
    [403, UNCHANGED.toLowerCase(), 'refused', undefined],
    [429, UNCHANGED, 'refused', undefined]
  ])('marks a %i whose body reads %j as %s, naming a download at %s', async (status, body, kind, since) => {
    const answer  = new Response(body, { status })
    const failure = await celestrak.download(Promise.resolve(answer), read)
      .catch((error: celestrak.Failed) => error.failure) as celestrak.Failure
    expect(failure).toMatchObject({ body, kind, status })
    expect('since' in failure ? failure.since : undefined).toBe(since)
  })

  it('keeps an empty body of a refusal that carries none', async () => {
    const answer = new Response(null, { status: 304 })
    await expect(celestrak.download(Promise.resolve(answer), read)).rejects.toMatchObject({
      failure: { body: '', kind: 'refused', status: 304 }
    })
  })

  it('keeps the status and the characters already read of a refusal whose body fails partway', async () => {
    const chunks = [new TextEncoder().encode('Forbidden ')]
    const body   = new ReadableStream({
      pull: controller => chunks.length > 0
        ? controller.enqueue(chunks.pop())
        : controller.error(new TypeError('Network connection lost'))
    })
    const answer = new Response(body, { status: 403 })
    await expect(celestrak.download(Promise.resolve(answer), read)).rejects.toMatchObject({
      failure: {
        body   : 'Forbidden ',
        kind   : 'refused',
        reason : 'CelesTrak answered 403, and reading its body failed with TypeError: '
               + 'Network connection lost',
        status : 403
      }
    })
  })

  it('keeps the first characters of a long refusal and cancels the rest of its body', async () => {
    const cancel = vi.fn()
    const body   = new ReadableStream({
      cancel : cancel,
      pull   : controller => controller.enqueue(new TextEncoder().encode('x'.repeat(1000)))
    })
    const failure = await celestrak.download(Promise.resolve(new Response(body, { status: 429 })), read)
      .catch((error: celestrak.Failed) => error.failure)
    expect(failure).toMatchObject({ body: 'x'.repeat(celestrak.EXCERPT), status: 429 })
    expect(cancel).toHaveBeenCalledOnce()
  })
})

describe('a directory', () => {
  it('reads the time it lists for the SATCAT file as UTC', () => {
    expect(celestrak.listedOf(directoryBody(Date.parse(SINCE)))).toBe(Date.parse(SINCE))
  })

  it.each([
    ['a list naming another file alone',
      JSON.stringify([{ FILE_MTIME: '2026-11-15 21:21:36 UTC', FILE_NAME: 'x.csv' }])],
    ['an object', JSON.stringify({ FILE_NAME: 'satcat.csv', FILE_MTIME: '2026-11-15 21:21:36 UTC' })],
    ['a time with no zone', directoryBody(Date.parse(SINCE)).replaceAll(' UTC', '')]
  ])('fails its check on %s', (_, body) => {
    expect(() => celestrak.listedOf(body)).toThrow(celestrak.Failed)
  })

  it('fails its check on a body that is not JSON, once read through a download', async () => {
    const failure = celestrak.download(Promise.resolve(new Response('<html>')), celestrak.listedOf)
    await expect(failure).rejects.toMatchObject({ failure: { kind: 'unchecked' } })
  })
})

describe('a SATCAT file', () => {
  const rows = Array.from({ length: 5000 }, (_, row) => [row + 1, 'PAY', '+'] as const)

  it('keeps the code of each payload by its catalog number, reading a quoted name holding a comma', () => {
    const codes = celestrak.codesOf(satcatBody([...rows, [9001, 'PAY', '-'], [9002, 'DEB', '+']]))
    expect([Object.keys(codes).length, codes[1], codes[9001], codes[9002]])
      .toEqual([5001, '+', '-', undefined])
  })

  it('keeps no status for a payload whose row ends before its status code', () => {
    const codes = celestrak.codesOf(`${satcatBody(rows)}SAT,2026-001A,9003,PAY\r\n`)
    expect(codes[9003]).toBe('')
  })

  it.each([
    ['holds a column too few', 'NORAD_CAT_ID,OBJECT_TYPE\r\n1,PAY\r\n', 'OPS_STATUS_CODE'],
    ['holds a payload too few', satcatBody(rows.slice(1)), 'got 4999'],
    ['is empty', '', 'NORAD_CAT_ID']
  ])('fails its check where it %s', (_, body, reason) => {
    expect(() => celestrak.codesOf(body)).toThrow(expect.objectContaining({
      failure: expect.objectContaining({ kind: 'unchecked', reason: expect.stringContaining(reason) })
    }))
  })
})
