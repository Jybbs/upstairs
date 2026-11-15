import { readFile } from 'node:fs/promises'

import { describe, expect, it, vi } from 'vitest'

import init, * as orbit from '../../../../rust/pkg/orbit.js'
import { encode }       from '../../catalog/encode.ts'
import type { Record }  from '../../lib/orbit/catalog.ts'
import * as catalog     from '../../lib/orbit/catalog.ts'
import { kindOf }       from '../../lib/orbit/kinds.ts'
import { satellitesOf } from '../../lib/orbit/scan.ts'
import answers          from '../fixtures/answers.json' with { type: 'json' }
import full             from '../fixtures/records.json' with { type: 'json' }

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

  it('keeps the fields the known answers place each record from', () => {
    expect(catalog.FIELDS).toEqual(answers.fields)
  })

  it('places each record, segment by segment, where the known answers do', async () => {
    await init({ module_or_path: await readFile(new URL('../../../../rust/pkg/orbit_bg.wasm', import.meta.url)) })
    const orbits = new orbit.Orbits()
    for (const segment of segments) {
      orbits.extend(segment.records.map(record => record.EPOCH), catalog.elementsOf(segment.records))
    }
    const { grid: window, spot } = answers
    const grid     = new orbit.Grid(orbits, Date.parse(answers.start), window.counts.length, window.step)
    grid.fill(orbits, 0, orbits.size)
    const sighting = grid.sight(spot.latitude, spot.longitude)
    const risen    = Array.from(sighting.risen, row => satellitesOf(decoded)[row].id)
    expect(Array.from(sighting.counts)).toEqual(window.counts)
    expect(risen.toSorted()).toEqual(window.risen.toSorted())
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

  it('reads the records before Starlink’s while the rest of the file is still missing', async () => {
    const { gunzipSync, gzipSync } = await import('node:zlib')
    const others = records.filter(record => kindOf(record.OBJECT_NAME) !== 'starlink')
    const cut    = gunzipSync(encode(fetched, others)).length
    const stream = new Blob([gzipSync(gunzipSync(encode(fetched, records)).subarray(0, cut))]).stream()
    const { value } = await catalog.segmentsOf(stream).next()
    expect(value?.records).toHaveLength(others.length)
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

describe('the ages of a catalog', () => {
  it('reads the age of each record in days, from its epoch to the time the catalog was fetched', () => {
    expect([...catalog.agesOf(records, fetched)])
      .toEqual(records.map(record => (fetched - catalog.timeOf(record.EPOCH)) / catalog.DAY))
  })
})

describe('the epoch of a record', () => {
  it.each(['America/New_York', 'Asia/Tokyo'])('reads an epoch as UTC to the millisecond in %s', zone => {
    vi.stubEnv('TZ', zone)
    expect(catalog.timeOf('2026-11-06T11:57:30.504672')).toBe(Date.UTC(2026, 10, 6, 11, 57, 30, 504))
  })
})

describe('the body of the catalog file', () => {
  it('returns the body the server sends', async () => {
    const response = new Response('catalog')
    vi.stubGlobal('fetch', async () => response)
    expect(await catalog.bodyOf(catalog.FILE)).toBe(response.body)
  })

  it.each([
    ['an error', new Response('', { status: 503 }), 503],
    ['an empty body', new Response(null, { status: 204 }), 204]
  ])('throws where the server answers with %s', async (_, response, status) => {
    vi.stubGlobal('fetch', async () => response)
    await expect(catalog.bodyOf(catalog.FILE)).rejects.toThrow(`The catalog answered ${status}`)
  })
})
