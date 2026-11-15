import { describe, expect, it } from 'vitest'

import { clamp, Spring } from '../../lib/site/motion.ts'

describe('holding a value', () => {
  it.each([
    [-1, 0],
    [0.5, 0.5],
    [2, 1]
  ])('holds %f between 0 and 1 as %f', (value, held) => {
    expect(clamp(value, 0, 1)).toBe(held)
  })
})

describe('a spring', () => {
  it('reaches its target without passing it and then reports it has stopped', () => {
    const spring    = new Spring()
    const positions = Array.from({ length: 60 }, () => (spring.advance(1, 28, 1 / 60), spring.position))
    expect(Math.max(...positions)).toBeLessThanOrEqual(1)
    expect(positions.at(-1)).toBeCloseTo(1, 2)
    expect(spring.advance(1, 28, 1 / 60)).toBe(false)
  })

  it('moves as far over one long frame as over the short frames that make it up', () => {
    const [long, short] = [new Spring(), new Spring()]
    long.advance(1, 22, 0.032)
    short.advance(1, 22, 0.016)
    short.advance(1, 22, 0.016)
    expect(long.position).toBeCloseTo(short.position, 10)
  })

  it('stops where it rests, with no velocity left to carry it', () => {
    const spring = new Spring()
    spring.velocity = 5
    spring.rest(3)
    expect([spring.position, spring.velocity, spring.advance(3, 22, 1 / 60)]).toEqual([3, 0, false])
  })
})
