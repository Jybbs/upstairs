import { expect, it } from 'vitest'

import { weighedOf } from '../../lib/site/names.ts'

it.each([
  ['STARLINK-31414', 'STARLINK', '-31414'],
  ['ISS (ZARYA)', 'ISS', ' (ZARYA)'],
  ['NOAA 19', 'NOAA', ' 19'],
  ['COSMOS 2251 DEB [PLATFORM]', 'COSMOS', ' 2251 DEB [PLATFORM]'],
  ['HUBBLE', 'HUBBLE', ''],
  ['2024-001A', '2024-001A', '']
])('weighs %s as its base and what follows it', (name, base, rest) =>
  expect(weighedOf(name)).toEqual({ base, rest }))
