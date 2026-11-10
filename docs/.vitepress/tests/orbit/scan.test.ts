import { describe, expect, it } from 'vitest'

import type { Record } from '../../lib/orbit/catalog.ts'
import { kindOf }      from '../../lib/orbit/kinds.ts'
import * as scan       from '../../lib/orbit/scan.ts'
import answers         from '../fixtures/answers.json' with { type: 'json' }
import full            from '../fixtures/records.json' with { type: 'json' }

const records = full as unknown as Record[]

describe('the satellites of a catalog', () => {
  it('names each record by its catalog number, its name, and the kind its name reads as', () => {
    expect(scan.satellitesOf(records)).toEqual(records.map(record => ({
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
  const satellite = scan.satellitesOf(records).find(({ name }) => name === 'GOES 19')!
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
    const joined = { ...satellite, ...traced, heading: 12, key: `${satellite.id}/0` }
    expect(scan.passOf(satellite, { ...traced, heading: 12 })).toEqual(joined)
  })

  it('marks a satellite the WebAssembly module gives no heading as holding its place', () => {
    expect(scan.passOf(satellite, traced).heading).toBeNull()
  })
})
