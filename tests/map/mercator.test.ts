import { describe, expect, it } from 'vitest'

import { BANDS, reliefRamp } from '../../src/map/style.ts'
import { View, xOf, yOf } from '../../src/map/mercator.ts'

describe('the view', () => {
  const view = new View()
  view.set(1000, 600, 2, 170, 0)

  it('places the center at the middle of the view', () => {
    expect(view.column(170)).toBeCloseTo(500)
    expect(view.row(0)).toBeCloseTo(300)
  })
  it('keeps a longitude past the antimeridian beside the center', () => {
    expect(view.column(-170)).toBeCloseTo(500 + 20 / 360 * 2048)
  })
  it('maps the world edges', () => {
    expect(xOf(-180)).toBe(0)
    expect(yOf(0)).toBeCloseTo(0.5)
  })
})

describe('the relief ramp', () => {
  it('rises strictly, as an interpolation requires', () => {
    const stops = (reliefRamp() as unknown[]).slice(3).filter(value => typeof value === 'number') as number[]
    expect(stops.length).toBe(BANDS.length * 2)
    stops.slice(1).forEach((stop, index) => expect(stop).toBeGreaterThan(stops[index]))
  })
})
