import { describe, expect, it } from 'vitest'

import { SEEN, seenAt, sunAt } from '../../lib/orbit/seen.ts'

const DEGREES = 180 / Math.PI
const SPOT    = { latitude: 0, longitude: 0 }

/**
 * A satellite straight over the spot on the equator at the prime meridian.
 */
const OVERHEAD = { elevation: 90, latitude: 0, longitude: 0 }

describe('sunAt', () => {
  it.each([
    ['stands over the equator at the March equinox', '2026-03-20T12:00:00Z', 'declination', 0],
    ['stands over the tropic of Cancer at the June solstice', '2026-06-21T00:00:00Z', 'declination', 23.44],
    ['stands east of Greenwich at noon in March, the sun running late then', '2026-03-20T12:00:00Z',
      'longitude', 1.86],
    ['stands over the antimeridian near midnight', '2026-06-21T00:00:00Z', 'longitude', -179.57]
  ] as const)('%s', (_, time, angle, degrees) => {
    const [x, y, z] = sunAt(Date.parse(time))
    const read      = { declination: Math.asin(z), longitude: Math.atan2(y, x) }[angle] * DEGREES
    expect(read).toBeCloseTo(degrees, 1)
  })

  it('returns a unit vector', () =>
    expect(Math.hypot(...sunAt(Date.parse('2026-11-13T19:00:00Z')))).toBeCloseTo(1, 12))
})

describe('seenAt', () => {
  it.each([
    ['sees a satellite in sunlight overhead after dusk', OVERHEAD, 400, '2026-03-20T18:45:00Z', true],
    ['sees nothing while the sun stands 5.9° under the horizon', OVERHEAD, 400,
      '2026-03-20T18:31:00Z', false],
    ['sees a satellite once the sun stands 6.2° under the horizon', OVERHEAD, 400,
      '2026-03-20T18:32:00Z', true],
    ['sees nothing in daylight', OVERHEAD, 400, '2026-03-20T12:00:00Z', false],
    ['sees nothing in Earth’s shadow at midnight', OVERHEAD, 400, '2026-03-21T00:00:00Z', false],
    ['sees nothing once the sun stands 20.7° down, deep enough to shade 400 km up', OVERHEAD, 400,
      '2026-03-20T19:30:00Z', false],
    ['sees a satellite higher up out of that same shadow', OVERHEAD, 2000, '2026-03-20T19:30:00Z', true],
    ['sees nothing under 10° up', { ...OVERHEAD, elevation: 9.9 }, 400, '2026-03-20T18:45:00Z', false],
    ['sees a satellite at 10° up', { ...OVERHEAD, elevation: 10 }, 400, '2026-03-20T18:45:00Z', true],
    ['sees nothing 5,000 km away or farther', OVERHEAD, 5000, '2026-03-20T18:45:00Z', false],
    ['sees a satellite just inside 5,000 km', OVERHEAD, 4999, '2026-03-20T18:45:00Z', true]
  ] as const)('%s', (_, look, height, time, seen) =>
    expect(seenAt(look, height, SPOT, Date.parse(time))).toBe(seen))

  it.each([
    ['reads the limits it is given', '2026-03-20T18:31:00Z', { ...SEEN, dusk: 5 }],
    ['sees a satellite between Earth and the sun', '2026-03-20T12:00:00Z', { ...SEEN, dusk: -90 }]
  ] as const)('%s', (_, time, seen) => expect(seenAt(OVERHEAD, 400, SPOT, Date.parse(time), seen)).toBe(true))
})
