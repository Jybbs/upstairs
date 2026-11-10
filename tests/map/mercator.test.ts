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
  it.each([[170, -170, 500 + 20 / 360 * 2048], [-170, 170, 500 - 20 / 360 * 2048]])(
    'keeps a longitude past the antimeridian beside a center at %f',
    (center, longitude, column) => {
      const across = new View()
      across.set(1000, 600, 2, center, 0)
      expect(across.column(longitude)).toBeCloseTo(column)
    }
  )
  it.each([[0, 1], [60, 2]])(
    'spreads a kilometer at latitude %f over %f times its pixels at the equator',
    (latitude, factor) => expect(view.scale(latitude)).toBeCloseTo(factor * 2048 / 40075.017)
  )
  it.each([[-5, 10, 0, false], [-5, 10, 10, true], [1000, 600, 0, true], [1001, 300, 0, false]])(
    'reads the point at %f, %f with a margin of %f as inside: %s',
    (x, y, margin, inside) => expect(view.inside(x, y, margin)).toBe(inside)
  )
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
