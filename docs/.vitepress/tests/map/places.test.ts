import { expect, it } from 'vitest'

import { View }       from '../../lib/map/mercator.ts'
import type { Label } from '../../lib/map/overlay.ts'
import { placeNear }  from '../../lib/map/places.ts'

const view = new View()
view.set(1000, 600, 9, 0, 0)

/**
 * Returns a label standing `x` and `y` pixels from the view's center.
 */
const labelAt = (name: string, x: number, y: number, tier: Label['tier'] = 'city'): Label =>
  ({ latitude: -y / view.scale(0) / 111.32, longitude: x / view.scale(0) / 111.32, name, tier })

it.each([
  ['pulls the pin onto the nearest town within 14 px',
    [labelAt('Far', 12, 0), labelAt('Near', 0, 6)], 'Near'],
  ['leaves the pin where no town stands within 14 px', [labelAt('Far', 15, 0)], null],
  ['passes over a region or a water however near',
    [labelAt('Sea', 2, 0, 'water'), labelAt('Shire', 0, 2, 'region')], null]
] as const)('%s', (_, labels, name) =>
  expect(placeNear(labels, 500, 300, view)?.label.name ?? null).toBe(name))
