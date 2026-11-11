import { readFile } from 'node:fs/promises'
import { join }     from 'node:path'

import init, * as orbit  from '../../../../rust/pkg/orbit.js'
import * as catalog      from '../../lib/orbit/catalog.ts'
import { kindOf }        from '../../lib/orbit/kinds.ts'
import * as looks        from '../../lib/orbit/looks.ts'
import type { Spot }     from '../../lib/orbit/scan.ts'
import { kindColor }     from '../../lib/site/palette.ts'
import { HOME }          from '../../lib/state/address.ts'
import type { Drawings } from '../../lib/state/drawings.ts'
import full              from './records.json' with { type: 'json' }

/**
 * The instant the fixture reads the station from.
 */
export const START = Date.parse('2026-11-06T18:37:00Z')
const records      = full as unknown as catalog.Record[]
const station      = records.filter(record => record.NORAD_CAT_ID === looks.ISS)

/**
 * Returns the station of the committed records watched over `spot` through
 * the day from `start`.
 */
export const watchOf = async (spot: Spot = HOME.spot, start = START) => {
  const wasm = join(import.meta.dirname, '../../../../rust/pkg/orbit_bg.wasm')
  await init({ module_or_path: await readFile(wasm) })
  const orbits = new orbit.Orbits()
  orbits.extend(station.map(record => record.EPOCH), catalog.elementsOf(station))
  return new looks.Watch(orbits, 0, spot, start)
}

/**
 * Builds the drawings' values from the committed records as the page builds
 * them from the catalog it serves.
 */
export const drawingsOf = async (): Promise<Drawings> => {
  const watch = await watchOf()
  return {
    ages    : catalog.agesOf(records, START),
    color   : kindColor(kindOf(station[0].OBJECT_NAME)),
    highest : watch.highest!,
    scanned : watch.scanned!
  }
}
