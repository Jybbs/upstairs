import type { Spot } from '../orbit/scan.ts'

/**
 * The decimals each coordinate of a spot keeps in the page's address.
 */
export const DECIMALS = 2
/**
 * The place and spot the map opens on where the address names no spot.
 */
export const HOME = { place: 'Boston', spot: { latitude: 42.36, longitude: -71.06 } }

/**
 * Writes a spot as the fragment of the page's address, each coordinate rounded
 * to `DECIMALS`.
 */
export const fragmentOf = ({ latitude, longitude }: Spot): string =>
  `#${latitude.toFixed(DECIMALS)},${longitude.toFixed(DECIMALS)}`

/**
 * Reads the spot a fragment of the page's address holds, returning `null` where
 * it holds no latitude and longitude on the globe.
 */
export const spotIn = (fragment: string): Spot | null => {
  const [latitude, longitude] = fragment.slice(1).split(',').map(parseFloat)
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null
}
