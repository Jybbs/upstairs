/**
 * Reads the compressed catalog file, a head followed by segments of records
 * stored as columns of 32-bit integers, and judges how old a catalog is.
 */
export type Record = {
  readonly [Field in typeof FIELDS[number]]: Field extends 'OBJECT_NAME' | 'EPOCH' ? string : number
}

/**
 * Days old past which positions may drift, and past which none are drawn.
 */
export const AGES = { limit: 14, warn: 3 } as const
export const DAY  = 86_400_000
/**
 * The decimal fields in file order, each a column of whole mantissas beside
 * their powers of ten, mapped to whether the column holds differences from the
 * row before.
 */
export const DECIMALS = {
  MEAN_MOTION       : false,
  ECCENTRICITY      : false,
  INCLINATION       : true,
  RA_OF_ASC_NODE    : true,
  ARG_OF_PERICENTER : false,
  MEAN_ANOMALY      : false,
  BSTAR             : false
} as const
/**
 * The name of the catalog file, both where the site requests it and where
 * Workers KV stores it.
 */
export const FILE = 'catalog.bin'
/**
 * The version of the file layout, the first value of every catalog file.
 */
export const FORMAT = 1
/**
 * Bytes before the first segment, holding the layout version, the time
 * fetched, and the segment count.
 */
export const HEAD = 16
/**
 * Bytes opening a segment, holding its record count and the length of its
 * name tails.
 */
export const SEGMENT_HEAD = 8
/**
 * The microseconds in one unit of an epoch's time of day, a hundred-millionth
 * of a day.
 */
export const TICK = 864
/**
 * Every field a catalog record keeps.
 */
export const FIELDS = [
  'OBJECT_NAME', 'NORAD_CAT_ID', 'EPOCH', ...Object.keys(DECIMALS) as (keyof typeof DECIMALS)[]
] as const
/**
 * Bytes per record before the name tails, for the id, the epoch, the decimals,
 * and the shared prefix.
 */
const WIDTH = 4 + 8 + 5 * Object.keys(DECIMALS).length + 1

/**
 * Reads a column of 32-bit integers stored as four planes of bytes, lowest
 * first, undoing the zigzag differences of a delta column.
 */
const columnOf = (bytes: Uint8Array, count: number, delta: boolean) => {
  const column = new Int32Array(count)
  for (let row = 0, last = 0; row < count; row++) {
    const value = bytes[row] | bytes[count + row] << 8 | bytes[2 * count + row] << 16
                | bytes[3 * count + row] << 24
    column[row] = delta ? last += (value >>> 1) ^ -(value & 1) : value
  }
  return column
}

const epochOf = (day: number, ticks: number) => {
  const micros = ticks * TICK
  const second = new Date(day * DAY + Math.floor(micros / 1000)).toISOString().slice(0, 19)
  return `${second}.${String(micros % 1e6).padStart(6, '0')}`
}

/**
 * Reads a stream in pieces of the lengths asked for.
 */
const readerOf = (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader()
  let held: Uint8Array = new Uint8Array()
  return async (length: number) => {
    while (held.length < length) {
      const { done, value } = await reader.read()
      if (done) throw new Error('The catalog file ends early')
      const joined = new Uint8Array(held.length + value.length)
      joined.set(held)
      joined.set(value, held.length)
      held = joined
    }
    const piece = held.subarray(0, length)
    held = held.subarray(length)
    return piece
  }
}

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

/**
 * Returns the days from `from` to `to`, both Unix times in milliseconds.
 */
export const ageOf = (from: number, to: number) => (to - from) / DAY

/**
 * The age in days of each record's element set at `fetched`, in the records'
 * order.
 */
export const agesOf = (records: readonly Record[], fetched: number) =>
  Float64Array.from(records, record => ageOf(timeOf(record.EPOCH), fetched))

/**
 * Returns the body of the catalog file at `url`, throwing where the server
 * answers with an error or an empty body.
 */
export const bodyOf = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`The catalog answered ${response.status}`)
  return response.body
}

/**
 * The decimal fields of each record in turn, in file order, which the
 * WebAssembly module's `Orbits.extend` reads beside the records' epochs.
 */
export const elementsOf = (records: readonly Record[]) => {
  const fields = Object.keys(DECIMALS) as (keyof typeof DECIMALS)[]
  return Float64Array.from(records.flatMap(record => fields.map(field => record[field])))
}

/**
 * Whether a catalog of this age in days still places satellites, and whether
 * they may drift.
 */
export const freshnessOf = (age: number) => age > AGES.limit ? 'expired' : age > AGES.warn ? 'aging' : 'fresh'

/**
 * The Unix time in milliseconds of a record's epoch, a UTC time, to the
 * millisecond.
 */
export const timeOf = (epoch: string) => Date.parse(`${epoch.slice(0, 23)}Z`)

/**
 * Rebuilds the records of one segment from the bytes after its head.
 */
export const recordsOf = (body: Uint8Array, count: number): Record[] => {
  let at = 0
  const take = (length: number) => body.subarray(at, at += length)
  const ids      = columnOf(take(4 * count), count, true)
  const days     = columnOf(take(4 * count), count, false)
  const ticks    = columnOf(take(4 * count), count, false)
  const decimals = Object.entries(DECIMALS)
    .map(([field, delta]) => [field, take(count), columnOf(take(4 * count), count, delta)] as const)
  const shared = take(count)
  const tails  = new TextDecoder().decode(body.subarray(at)).split('\n')

  let name = ''
  return Array.from(ids, (id, row) => {
    name = name.slice(0, shared[row]) + tails[row]
    const record: { [field: string]: number | string } = {
      EPOCH        : epochOf(days[row], ticks[row]),
      NORAD_CAT_ID : id,
      OBJECT_NAME  : name
    }
    for (const [field, powers, mantissas] of decimals) record[field] = mantissas[row] / 10 ** powers[row]
    return record as unknown as Record
  })
}

/**
 * Reads a compressed catalog file one segment at a time, with the time it was
 * fetched from CelesTrak.
 */
export async function* segmentsOf(stream: ReadableStream<Uint8Array<ArrayBuffer>>) {
  const read   = readerOf(stream.pipeThrough(new DecompressionStream('gzip')))
  const head   = viewOf(await read(HEAD))
  const format = head.getUint32(0, true)
  if (format !== FORMAT) throw new Error(`The catalog file has layout ${format}, not ${FORMAT}`)
  const fetched = head.getFloat64(4, true)
  for (let segment = head.getUint32(12, true); segment > 0; segment--) {
    const counts = viewOf(await read(SEGMENT_HEAD))
    const count  = counts.getUint32(0, true)
    yield { fetched, records: recordsOf(await read(WIDTH * count + counts.getUint32(4, true)), count) }
  }
}
