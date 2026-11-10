import { describe, expect, it } from 'vitest'

import * as catalog from '../../src/orbit/catalog.ts'
import { kindOf }   from '../../src/orbit/kinds.ts'
import * as scan    from '../../src/orbit/scan.ts'
import answers      from '../fixtures/answers.json' with { type: 'json' }
import full         from '../fixtures/records.json' with { type: 'json' }

const records = full as unknown as catalog.Record[]
const trimmed = catalog.recordsOf({
  fetched : '',
  fields  : catalog.FIELDS,
  rows    : records.map(record => catalog.FIELDS.map(field => record[field]))
})

describe('the trimmed catalog', () => {
  it.each(records.map((record, index) => [record.OBJECT_NAME, index] as const))(
    'keeps every field of %s the site reads',
    (_, index) => {
      const fields = catalog.FIELDS.map(field => [field, records[index][field]])
      expect(trimmed[index]).toEqual(Object.fromEntries(fields))
    }
  )

  it('keeps the fields the known answers place each record from', () => {
    expect(catalog.FIELDS).toEqual(answers.fields)
  })
})

describe('the satellites of a catalog', () => {
  it('names each record by its catalog number, its name, and the kind its name reads as', () => {
    expect(scan.satellitesOf(trimmed)).toEqual(records.map(record => ({
      id   : record.NORAD_CAT_ID,
      kind : kindOf(record.OBJECT_NAME),
      name : record.OBJECT_NAME
    })))
  })
})

describe('the windows of a scan', () => {
  it.each([
    ['grid', answers.grid, scan.GRID_STEP],
    ['track', answers.track, scan.TRACK_STEP]
  ] as const)('samples the %s at the step the known answers were taken at', (_, window, step) => {
    expect(window.step).toBe(step)
  })

  it('stores as many values per track sample as the known answers hold', () => {
    expect(scan.TRACK_WIDTH).toBe(answers.track.width)
  })

  it('takes one grid sample per count the known answers hold, both ends included', () => {
    expect(scan.samplesFor(answers.grid.minutes, scan.GRID_STEP)).toBe(answers.grid.counts.length)
  })
})

describe('a traced pass', () => {
  const satellite = scan.satellitesOf(trimmed).find(({ name }) => name === 'GOES 19')!
  const traced    = {
    earlier : true,
    heading : undefined,
    height  : 35786,
    later   : false,
    peak    : 40.9,
    peakAt  : 0,
    range   : 37500,
    riseAt  : 0,
    riseAz  : 203.5,
    setAt   : 7170,
    setAz   : 204.1
  }

  it('joins the satellite it belongs to, keeping each time, angle, and distance', () => {
    const joined = { ...satellite, ...traced, heading: 12 }
    expect(scan.passOf(satellite, { ...traced, heading: 12 })).toEqual(joined)
  })

  it('marks a satellite the WebAssembly module gives no heading as holding its place', () => {
    expect(scan.passOf(satellite, traced).heading).toBeNull()
  })
})
