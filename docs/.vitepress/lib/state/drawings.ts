/**
 * Reads the catalog once for every drawing on the Method page, running the
 * orbit crate on the page over the International Space Station alone as the
 * map's home spot sees it through the day from the minute the catalog was
 * fetched.
 */

import { onMounted, ref, shallowRef } from 'vue'

import init, * as orbit from '../../../../rust/pkg/orbit.js'
import * as catalog     from '../orbit/catalog.ts'
import { kindOf }       from '../orbit/kinds.ts'
import * as looks       from '../orbit/looks.ts'
import { minuteOf }     from '../orbit/scan.ts'
import { kindColor }    from '../site/palette.ts'
import { HOME }         from './address.ts'

/**
 * The age in days of every element set in the catalog, beside the highest pass
 * of the day, the pass the scan's samples miss the peak of by the most, and the
 * color of the station's kind.
 */
export interface Drawings {
  ages    : Float64Array
  color   : string
  highest : looks.Watched
  scanned : looks.Watched
}

/**
 * The line each drawing shows where its values could not be made from a
 * catalog that did load.
 */
export const UNDRAWN = 'The drawing could not be made'

let pending: Promise<Drawings> | undefined

/**
 * Returns the drawings' values, reading the catalog the first time it is
 * called and sharing that read with every later call, until a read fails and
 * the next call reads again.
 */
const drawingsOf = () => pending ??= load().catch((error: unknown) => {
  pending = undefined
  throw error
})

const load = async (): Promise<Drawings> => {
  const [{ fetched, records }] = await Promise.all([
    read().catch((cause: unknown) => { throw new Error(catalog.UNLOADED, { cause }) }),
    init()
  ])
  const station = records.find(record => record.NORAD_CAT_ID === looks.ISS)
  if (!station) throw new Error('The catalog holds no orbit for the space station')
  const orbits = new orbit.Orbits()
  orbits.extend([station.EPOCH], catalog.elementsOf([station]))
  const watch   = new looks.Watch(orbits, 0, HOME.spot, minuteOf(fetched))
  const highest = watch.highest
  const scanned = watch.scanned
  orbits.free()
  if (!highest || !scanned) throw new Error('The space station makes no pass over the spot that day')
  return {
    ages    : catalog.agesOf(records, fetched),
    color   : kindColor(kindOf(station.OBJECT_NAME)),
    highest : highest,
    scanned : scanned
  }
}

/**
 * Returns the records of the catalog the site serves, beside the time they
 * were fetched.
 */
const read = async () => {
  const body                      = await catalog.bodyOf(`${import.meta.env.BASE_URL}${catalog.FILE}`)
  const records: catalog.Record[] = []
  let fetched                     = 0
  for await (const segment of catalog.segmentsOf(body)) {
    fetched = segment.fetched
    records.push(...segment.records)
  }
  return { fetched, records }
}

/**
 * Returns a ref holding the drawings' values once a component has mounted and
 * the catalog is read, beside a ref holding the line each drawing shows in
 * their place where they fail, `UNLOADED` where the catalog read fails and
 * `UNDRAWN` otherwise.
 */
export const useDrawings = () => {
  const drawings = shallowRef<Drawings>()
  const failure  = ref<string>()
  onMounted(() => drawingsOf().then(
    values           => { drawings.value = values },
    (error: unknown) => {
      failure.value = error instanceof Error && error.message === catalog.UNLOADED ? catalog.UNLOADED : UNDRAWN
    }
  ))
  return { drawings, failure }
}
