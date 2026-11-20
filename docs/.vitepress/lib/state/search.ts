import type { Pass, Satellite, Spot } from '../orbit/scan.ts'

/**
 * A feature of a Photon answer, carrying the OpenStreetMap object it was read
 * from and the GeocodeJson address of the place.
 */
export interface Feature {
  geometry   : { coordinates: readonly number[] }
  properties : Record<string, number | string | undefined>
}

/**
 * A satellite whose name the words typed hold, beside its next pass over the
 * spot in the window, or null where it has none.
 */
export interface Match {
  pass      : Pass | null
  satellite : Satellite
}

/**
 * A place found, keyed by the OpenStreetMap object it stands for, labeled by
 * its name and region, beside the kind of place it is.
 */
export type Place = Spot & { key: string, kind: string, label: string }

/**
 * Compares two passes of one satellite for which comes next at `present`
 * seconds into the window, putting a pass not yet set ahead of one that has
 * set, of two passes yet to set the one rising first, and of two that have set
 * the one setting last.
 */
const sooner = (pass: Pass, other: Pass, present: number) =>
  Number(other.setAt >= present) - Number(pass.setAt >= present)
    || (pass.setAt >= present ? pass.riseAt - other.riseAt : other.setAt - pass.setAt)

/**
 * Returns at most `most` satellites whose names hold `name`, in capitals,
 * those with a pass in the window first, each still to set in the order its
 * next pass rises and then each that has set from the latest to set, and then
 * the rest of `satellites` in catalog order.
 */
export const matchesOf = (
  most       : number,
  name       : string,
  passes     : readonly Pass[],
  present    : number,
  satellites : readonly Satellite[]
): Match[] => {
  const next = new Map<number, Pass>()
  for (const pass of passes) {
    const held = next.get(pass.id)
    if (pass.name.includes(name) && (!held || sooner(pass, held, present) < 0)) next.set(pass.id, pass)
  }
  const passing = [...next.values()]
    .sort((a, b) => sooner(a, b, present))
    .map(pass => ({ pass, satellite: pass }))
  const resting = satellites
    .filter(satellite => satellite.name.includes(name) && !next.has(satellite.id))
    .map(satellite => ({ pass: null, satellite }))
  return [...passing, ...resting].slice(0, most)
}

/**
 * Reads a Photon feature as a place, labeled by its name, city, county, state,
 * and country with repeats dropped, its kind the OpenStreetMap place value
 * where the object is a place and its GeocodeJson type otherwise, written in
 * words and spelled the American way.
 */
export const placeOf = ({ geometry, properties }: Feature): Place => ({
  key       : `${properties.osm_type}${properties.osm_id}`,
  latitude  : geometry.coordinates[1],
  longitude : geometry.coordinates[0],

  kind: String((properties.osm_key === 'place' ? properties.osm_value : properties.type) ?? '')
    .replaceAll('_', ' ')
    .replace('neighbourhood', 'neighborhood'),

  label: [properties.name, properties.city, properties.county, properties.state, properties.country]
    .filter((part, index, all) => part && all.indexOf(part) === index)
    .join(', ')
})
