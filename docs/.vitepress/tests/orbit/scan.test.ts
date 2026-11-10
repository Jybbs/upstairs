import { ecfToLookAngles, eciToEcf, gstime, json2satrec, propagate } from 'satellite.js'
import { describe, expect, it }                                       from 'vitest'

import * as catalog from '../../lib/orbit/catalog.ts'
import * as scan    from '../../lib/orbit/scan.ts'
import full         from '../fixtures/records.json' with { type: 'json' }

const BOSTON  = { latitude: 42.36, longitude: -71.06 }
const records = full as unknown as catalog.Record[]
const start   = Date.parse('2026-11-06T18:37:00Z')
const trimmed = catalog.recordsOf({
  fetched : '',
  fields  : catalog.FIELDS,
  rows    : records.map(record => catalog.FIELDS.map(field => record[field]))
})

describe('the trimmed catalog', () => {
  it.each(records.map((record, index) => [record.OBJECT_NAME, index] as const))(
    'places %s where the full record does',
    (_, index) => {
      const date = new Date(start)
      const a    = propagate(json2satrec(records[index]), date)
      const b    = propagate(json2satrec(trimmed[index]), date)
      expect(b?.position).toEqual(a?.position)
    }
  )
})

describe('the rough grid', () => {
  const satellites = scan.satellitesOf(records)
  const samples    = scan.samplesFor(60, scan.GRID_STEP)
  const grid       = new Float32Array(satellites.length * samples * 3)
  satellites.forEach((satellite, row) => scan.fillGrid(grid, row, satellite.record, start, samples))
  const { counts, risen } = scan.readGrid(grid, satellites.length, samples, BOSTON)

  it.each(Array.from({ length: samples }, (_, sample) => [sample]))(
    'counts sample %i as the look angles do',
    sample => {
      const date     = new Date(start + sample * scan.GRID_STEP * 1000)
      const expected = satellites.filter(({ record }) => {
        const moved = propagate(record, date)
        return moved
          && ecfToLookAngles(scan.observerOf(BOSTON), eciToEcf(moved.position, gstime(date))).elevation > 0
      }).length
      expect(counts[sample]).toBe(expected)
    }
  )

  it('lists a geostationary satellite in view as risen', () => {
    expect(risen.map(row => satellites[row].name)).toContain('GOES 19')
  })
})

describe('a traced pass', () => {
  const satellites = scan.satellitesOf(records)
  const samples    = scan.samplesFor(120, scan.TRACK_STEP)
  const trace      = (name: string) => {
    const track = new Float32Array(samples * scan.TRACK_WIDTH)
    return {
      pass  : scan.traceInto(track, 0, satellites.find(item => item.name === name)!, BOSTON, start, samples),
      track : track
    }
  }

  it('marks a geostationary satellite as holding its place', () => {
    const { pass } = trace('GOES 19')
    expect(pass?.heading).toBeNull()
    expect(pass?.earlier && pass?.later).toBe(true)
    expect(pass?.height).toBeGreaterThan(35000)
  })

  it('keeps every elevation of the pass above the horizon between its rise and set', () => {
    const { pass, track } = trace('ISS (ZARYA)')
    if (!pass) return
    for (let at = pass.riseAt; at <= pass.setAt; at += scan.TRACK_STEP)
      expect(track[at / scan.TRACK_STEP * scan.TRACK_WIDTH + 2]).toBeGreaterThan(0)
  })
})
