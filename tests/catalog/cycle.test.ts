import { describe, expect, it, vi } from 'vitest'

import { SOURCE } from '../../catalog/celestrak.ts'
import { Cycle, EVERY } from '../../catalog/cycle.ts'
import { FILE, segmentsOf } from '../../src/orbit/catalog.ts'
import type { Record } from '../../src/orbit/catalog.ts'
import full from '../fixtures/records.json'

const fixture = full as unknown as Record[]
const records = Array.from({ length: 5000 }, (_, row) => ({
  ...fixture[row % fixture.length],
  NORAD_CAT_ID: 100_000 + row
}))
const start   = Date.parse('2026-11-10T00:00:00Z')

const SPACINGS = [[EVERY - 1, 'early'], [EVERY, 'stored']] as const
const REFUSALS = [301, 403, 404, 500, 503]

const cycleOf = (answer: () => Response, failedSends = 0) => {
  const state   = new Map<string, unknown>()
  const stored  = new Map<string, unknown>()
  const sent: { subject: string, text: string }[] = []
  const fetcher = vi.fn(async () => answer())
  const storage = {
    delete : (key: string) => state.delete(key),
    get    : <T>(key: string) => state.get(key) as T,
    put    : (key: string, value: unknown) => { state.set(key, value) }
  }
  const send = async (message: { subject: string, text: string }) => {
    if (failedSends-- > 0) throw new Error('E_RECIPIENT_NOT_ALLOWED')
    sent.push(message)
    return { messageId: '' }
  }
  const cycle = new Cycle(storage, {
    ALERT_FROM : 'catalog@upstairs.fyi',
    ALERT_TO   : 'someone@example.com',
    CATALOG    : { put: async (key: string, value: unknown) => void stored.set(key, value) },
    EMAIL      : { send } as unknown as Pick<SendEmail, 'send'>
  }, fetcher as unknown as typeof fetch)
  return { cycle, state, stored, sent, fetcher }
}

const good = () => Response.json(records)

describe('a download cycle', () => {
  it('stores the catalog it downloads, asking CelesTrak once with redirects left unfollowed', async () => {
    const { cycle, stored, fetcher } = cycleOf(good)
    expect(await cycle.run(start)).toBe('stored')
    expect(stored.get(FILE)).toBeInstanceOf(Uint8Array)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(SOURCE, expect.objectContaining({ redirect: 'manual' }))
  })

  it('dates the stored file by the time the cycle ran', async () => {
    const { cycle, stored } = cycleOf(good)
    await cycle.run(start)
    const file      = new Blob([stored.get(FILE) as Uint8Array<ArrayBuffer>])
    const { value } = await segmentsOf(file.stream()).next()
    expect(value?.fetched).toBe(start)
  })

  it.each(SPACINGS)('answers a run %i ms after the last as %s', async (after, outcome) => {
    const { cycle, fetcher } = cycleOf(good)
    await cycle.run(start)
    expect(await cycle.run(start + after)).toBe(outcome)
    expect(fetcher).toHaveBeenCalledTimes(outcome === 'early' ? 1 : 2)
  })

  it.each(REFUSALS)('halts on a %i, keeping the stored file and sending the alert', async status => {
    const { cycle, state, stored, sent } = cycleOf(() => new Response(null, { status }))
    expect(await cycle.run(start)).toBe('halted')
    expect(stored.size).toBe(0)
    expect(state.get('halted')).toContain(String(status))
    expect(sent).toEqual([expect.objectContaining({ text: expect.stringContaining(String(status)) })])
  })

  it.each([
    ['a list shorter than the active catalog', () => Response.json(records.slice(0, 10)), 'Expected a list'],
    ['a body that is not JSON', () => new Response('<html>'), 'JSON'],
    ['JSON that is not a list', () => Response.json({ error: 'busy' }), 'busy']
  ])('halts on %s', async (_, answer, reason) => {
    const { cycle, sent } = cycleOf(answer)
    expect(await cycle.run(start)).toBe('halted')
    expect(sent[0].text).toContain(reason)
  })

  it('stays halted through later cycles until resumed', async () => {
    let answer = () => new Response(null, { status: 403 })
    const { cycle, fetcher } = cycleOf(() => answer())
    await cycle.run(start)
    expect(await cycle.run(start + 2 * EVERY)).toBe('halted')
    expect(fetcher).toHaveBeenCalledTimes(1)
    answer = good
    cycle.resume()
    expect(await cycle.run(start + 3 * EVERY)).toBe('stored')
  })
  it('sends the alert again on each halted run until a send succeeds, asking CelesTrak once', async () => {
    const { cycle, sent, fetcher } = cycleOf(() => new Response(null, { status: 403 }), 2)
    await expect(cycle.run(start)).rejects.toThrow('E_RECIPIENT_NOT_ALLOWED')
    await expect(cycle.run(start + EVERY)).rejects.toThrow('E_RECIPIENT_NOT_ALLOWED')
    expect(sent).toHaveLength(0)
    expect(await cycle.run(start + 2 * EVERY)).toBe('halted')
    expect(sent).toEqual([expect.objectContaining({ text: expect.stringContaining('403') })])
    expect(await cycle.run(start + 3 * EVERY)).toBe('halted')
    expect(sent).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('alerts again on a failure after a resume', async () => {
    const { cycle, sent } = cycleOf(() => new Response(null, { status: 403 }))
    await cycle.run(start)
    cycle.resume()
    expect(await cycle.run(start + EVERY)).toBe('halted')
    expect(sent).toHaveLength(2)
  })
})
