import { readFile } from 'node:fs/promises'

import { json2satrec, propagate } from 'satellite.js'
import { describe, expect, it }   from 'vitest'

import { encode }      from '../../catalog/encode.ts'
import type { Record } from '../../src/orbit/catalog.ts'
import * as catalog    from '../../src/orbit/catalog.ts'
import { kindOf }      from '../../src/orbit/kinds.ts'
import full            from '../fixtures/records.json'

const records = full as unknown as Record[]
const fetched = Date.parse('2026-11-06T18:53:57.264Z')
const LIMIT   = 450_000

const read = async (file: Uint8Array<ArrayBuffer>) => {
  const segments: { fetched: number, records: Record[] }[] = []
  for await (const segment of catalog.segmentsOf(new Blob([file]).stream())) segments.push(segment)
  return segments
}

const segments = await read(encode(fetched, records))
const decoded  = segments.flatMap(segment => segment.records)
const byId     = new Map(decoded.map(record => [record.NORAD_CAT_ID, record]))
const cases    = records.map(record => [record.OBJECT_NAME, record] as const)
const fieldsOf = (record: Record) => Object.fromEntries(catalog.FIELDS.map(field => [field, record[field]]))

describe('the catalog file', () => {
  it.each(cases)('keeps every field of %s', (_, record) => {
    expect(fieldsOf(byId.get(record.NORAD_CAT_ID)!)).toEqual(fieldsOf(record))
  })

  it.each(cases)('places %s where the full record does', (_, record) => {
    const date = new Date(fetched)
    const kept = json2satrec(byId.get(record.NORAD_CAT_ID)!)
    expect(propagate(kept, date)?.position).toEqual(propagate(json2satrec(record), date)?.position)
  })

  it.each([
    ['a prefix ending inside a surrogate pair', ['X 🛰', 'X 🛸']],
    ['a prefix longer than 255 characters', ['A'.repeat(300), `${'A'.repeat(300)}B`]]
  ])('keeps names sharing %s', async (_, names) => {
    const named = names.map((name, row) => ({ ...records[0], OBJECT_NAME: name, NORAD_CAT_ID: row + 1 }))
    const [first] = await read(encode(fetched, named))
    expect(first.records.map(record => record.OBJECT_NAME)).toEqual(names)
  })

  it('carries the time it was fetched', () => {
    expect(segments.map(segment => segment.fetched)).toEqual([fetched, fetched])
  })

  it('reads every record but Starlink’s first', () => {
    const kindsOf = (listed: Record[]) => new Set(listed.map(record => kindOf(record.OBJECT_NAME)))
    const [first, second] = segments.map(segment => kindsOf(segment.records))
    expect(first.has('starlink')).toBe(false)
    expect(second).toEqual(new Set(['starlink']))
  })

  it.each([
    ['a file cut short', (file: Uint8Array) => file.subarray(0, file.length / 2), /ends early/],
    ['another layout', (file: Uint8Array) => file.with(0, file[0] ^ 0xff), /layout/]
  ] as const)('rejects %s', async (_, damage, error) => {
    const { gunzipSync, gzipSync } = await import('node:zlib')
    await expect(read(gzipSync(damage(gunzipSync(encode(fetched, records)))))).rejects.toThrow(error)
  })

  it.each([
    ['a value it cannot hold exactly', { BSTAR: 2 ** 40 + 0.5 }, /BSTAR/],
    ['a value with no decimal form', { ECCENTRICITY: 1e-30 }, /no decimal form/],
    ['an epoch with no fraction of a second', { EPOCH: '2026-11-09T12:00:00' }, /EPOCH/],
    ['a name holding a line break', { OBJECT_NAME: 'TWO\nLINES' }, /OBJECT_NAME/]
  ] as const)('fails on %s', (_, field, error) => {
    expect(() => encode(fetched, [{ ...records[0], ...field }])).toThrow(error)
  })

  it(`stays under ${LIMIT.toLocaleString()} bytes for the whole active catalog`, async () => {
    const file  = await readFile(new URL('../fixtures/catalog.bin', import.meta.url))
    const whole = (await read(file)).flatMap(segment => segment.records)
    expect(whole.length).toBeGreaterThan(10_000)
    expect(encode(fetched, whole).length).toBeLessThan(LIMIT)
  })
})

describe('the catalog age', () => {
  it.each([
    [0, 'fresh'],
    [catalog.AGES.warn, 'fresh'],
    [catalog.AGES.warn + 0.1, 'aging'],
    [catalog.AGES.limit, 'aging'],
    [catalog.AGES.limit + 0.1, 'expired']
  ] as const)('reads %f days as %s', (days, freshness) => {
    expect(catalog.freshnessOf(catalog.ageOf(fetched, fetched + days * catalog.DAY))).toBe(freshness)
  })
})
