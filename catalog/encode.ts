/**
 * Writes the compressed catalog file the site reads, every value checked to
 * read back exactly before the file is written.
 */
import { Buffer }   from 'node:buffer'
import { gzipSync } from 'node:zlib'

import type { Record } from '../src/orbit/catalog.ts'
import * as catalog    from '../src/orbit/catalog.ts'
import { kindOf }      from '../src/orbit/kinds.ts'

/**
 * The largest power of ten a double holds exactly.
 */
const LARGEST = 22

/**
 * Splits an epoch into whole days since 1970 and the hundred-millionths of a
 * day after them.
 */
const daysOf = (epoch: string): [day: number, ticks: number] => {
  const [whole, fraction = ''] = epoch.split('.')
  const time   = Date.parse(`${whole}Z`)
  const day    = Math.floor(time / catalog.DAY)
  const micros = (time - day * catalog.DAY) * 1000 + Number(fraction.padEnd(6, '0'))
  return [day, Math.round(micros / catalog.TICK)]
}

/**
 * Scales a column to its largest power of ten where every mantissa still fits
 * in 32 bits, and otherwise gives each value its own power.
 */
const decimalsOf = (values: number[]) => {
  const pairs = values.map(scaled)
  const top   = Math.max(...pairs.map(([, power]) => power))
  const fixed = pairs.map(([mantissa, power]): [number, number] => [mantissa * 10 ** (top - power), top])
  return fixed.every(([mantissa]) => Math.abs(mantissa) < 2 ** 31) ? fixed : pairs
}

/**
 * Writes 32-bit integers as four planes of bytes, lowest first, as zigzag
 * differences for a delta column.
 */
const planesOf = (delta: boolean, values: readonly number[]) => {
  const planes = new Uint8Array(4 * values.length)
  values.forEach((value, row) => {
    const step = value - (values[row - 1] ?? 0)
    const word = delta ? (step << 1) ^ (step >> 31) : value
    for (let plane = 0; plane < 4; plane++) planes[plane * values.length + row] = word >>> 8 * plane
  })
  return planes
}

/**
 * Splits a value into the whole mantissa and the smallest power of ten that
 * divide back to it.
 */
const scaled = (value: number): [mantissa: number, power: number] => {
  for (let power = 0; power <= LARGEST; power++) {
    const mantissa = Math.round(value * 10 ** power)
    if (mantissa / 10 ** power === value) return [mantissa, power]
  }
  throw new Error(`${value} has no decimal form within ${LARGEST} places`)
}

/**
 * Lays out one segment of records sorted by catalog number, then reads it
 * back, failing on any field that does not survive exactly.
 */
const segmentOf = (records: readonly Record[]) => {
  const sorted = records.toSorted((a, b) => a.NORAD_CAT_ID - b.NORAD_CAT_ID)
  const names  = sorted.map(record => record.OBJECT_NAME)
  const epochs = sorted.map(record => daysOf(record.EPOCH))
  const shared = Uint8Array.from(names, (name, row) => sharedOf(names[row - 1] ?? '', name))
  const tails  = new TextEncoder().encode(names.map((name, row) => name.slice(shared[row])).join('\n'))
  const head   = Buffer.alloc(catalog.SEGMENT_HEAD)
  head.writeUInt32LE(sorted.length, 0)
  head.writeUInt32LE(tails.length, 4)

  const body = Buffer.concat([
    planesOf(true, sorted.map(record => record.NORAD_CAT_ID)),
    planesOf(false, epochs.map(([day]) => day)),
    planesOf(false, epochs.map(([, ticks]) => ticks)),
    ...Object.entries(catalog.DECIMALS).flatMap(([field, delta]) => {
      const pairs  = decimalsOf(sorted.map(record => Number(record[field as keyof Record])))
      const powers = Uint8Array.from(pairs, ([, power]) => power)
      return [powers, planesOf(delta, pairs.map(([mantissa]) => mantissa))]
    }),
    shared,
    tails
  ])

  catalog.recordsOf(body, sorted.length).forEach((read, row) => {
    const field = catalog.FIELDS.find(field => read[field] !== sorted[row][field])
    if (field) throw new Error(`${field} of ${sorted[row].NORAD_CAT_ID} does not survive: `
                             + `${sorted[row][field]} reads back as ${read[field]}`)
  })
  return Buffer.concat([head, body])
}

/**
 * Counts the characters a name shares with the name before it, at most 255
 * and never splitting a surrogate pair.
 */
const sharedOf = (before: string, name: string) => {
  let length = 0
  while (length < 255 && length < name.length && name[length] === before[length]) length++
  return length && /[\uD800-\uDBFF]/.test(name[length - 1]) ? length - 1 : length
}

/**
 * Writes the compressed catalog file, every record but Starlink's in the first
 * segment and Starlink's in the second.
 */
export const encode = (fetched: number, records: readonly Record[]): Uint8Array<ArrayBuffer> => {
  const segments = [
    records.filter(record => kindOf(record.OBJECT_NAME) !== 'starlink'),
    records.filter(record => kindOf(record.OBJECT_NAME) === 'starlink')
  ]
  const head = Buffer.alloc(catalog.HEAD)
  head.writeUInt32LE(catalog.FORMAT, 0)
  head.writeDoubleLE(fetched, 4)
  head.writeUInt32LE(segments.length, 12)
  return gzipSync(Buffer.concat([head, ...segments.map(segmentOf)]), { level: 9 })
}
