import { kindOrder, type Kind } from '../orbit/kinds.ts'
import type { Spot }            from '../orbit/scan.ts'

/**
 * The decimals each coordinate of a spot keeps in the page's address.
 */
export const DECIMALS = 2
/**
 * The place and spot the map opens on where the address names no spot.
 */
export const HOME = { place: 'Boston', spot: { latitude: 42.36, longitude: -71.06 } }

/**
 * The parameter after the spot that lists the kinds shown.
 */
const KINDS_KEY = 'kinds'

/**
 * Writes the fragment of the page's address, `spot` with each coordinate rounded
 * to `DECIMALS` and then `?kinds=` with the kinds shown, leaving out whichever is
 * null and returning nothing where both are.
 */
export const fragmentOf = (spot: Spot | null, kinds: readonly Kind[] | null): string => {
  const at     = spot ? `${spot.latitude.toFixed(DECIMALS)},${spot.longitude.toFixed(DECIMALS)}` : ''
  const listed = kinds ? `?${KINDS_KEY}=${kinds.join(',')}` : ''
  return at || listed ? `#${at}${listed}` : ''
}

/**
 * Reads the spot a fragment of the page's address holds ahead of any `?`,
 * returning `null` where it holds no latitude and longitude on the globe.
 */
export const spotIn = (fragment: string): Spot | null => {
  const [latitude, longitude] = fragment.slice(1).split('?')[0].split(',').map(parseFloat)
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null
}

/**
 * Reads the kinds shown that a fragment of the page's address lists after
 * `?kinds=`, in the order of `KINDS` and skipping a name `KINDS` lacks,
 * returning `null` where it lists none.
 */
export const kindsIn = (fragment: string): Kind[] | null => {
  const listed = new URLSearchParams(fragment.split('?')[1]).get(KINDS_KEY)?.split(',')
  return listed ? kindOrder.filter(kind => listed.includes(kind)) : null
}
