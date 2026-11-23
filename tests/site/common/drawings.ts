import { readFile } from 'node:fs/promises'
import { join }     from 'node:path'

import { onTestFinished }             from 'vitest'
import { onMounted, ref, shallowRef } from 'vue'

import init, * as orbit  from '../../../../rust/pkg/orbit.js'
import * as catalog      from '../../lib/orbit/catalog.ts'
import { kindOf }        from '../../lib/orbit/kinds.ts'
import * as looks        from '../../lib/orbit/looks.ts'
import type { Spot }     from '../../lib/orbit/scan.ts'
import { kindColor }     from '../../lib/site/palette.ts'
import { HOME }          from '../../lib/state/address.ts'
import type { Drawings } from '../../lib/state/drawings.ts'
import full              from '../fixtures/records.json' with { type: 'json' }

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
    name    : station[0].OBJECT_NAME,
    scanned : watch.scanned!
  }
}

/**
 * The ages the drawings read in place of the fixture's, and the line a failed
 * read shows, where a case sets them.
 */
const aged = {
  ages    : undefined as Float64Array | undefined,
  failure : undefined as string | undefined
}

/**
 * Sets the ages or the failure the drawings read in place of the fixture's,
 * resetting both once the case finishes.
 */
export const ageWith = (values: Partial<typeof aged>) => {
  Object.assign(aged, values)
  onTestFinished(() => {
    Object.assign(aged, { ages: undefined, failure: undefined })
  })
}

/**
 * Builds a stand-in for `lib/state/drawings.ts` from its `original` exports,
 * whose `useDrawings` gives the fixture's drawings once mounted, with the ages
 * or the failure a case sets through `ageWith`.
 */
export const drawingsModuleOf = async <T extends object>(original: T) => {
  const values = await drawingsOf()
  return {
    ...original,
    useDrawings: () => {
      const drawings = shallowRef<Drawings>()
      const failure  = ref<string>()
      onMounted(() => {
        if (aged.failure) failure.value = aged.failure
        else drawings.value = { ...values, ages: aged.ages ?? values.ages }
      })
      return { drawings, failure }
    }
  }
}
