import { describe, expect, it } from 'vitest'

import * as catalog       from '../../lib/orbit/catalog.ts'
import * as looks         from '../../lib/orbit/looks.ts'
import { TRACK_STEP }     from '../../lib/orbit/scan.ts'
import { START, watchOf } from '../fixtures/drawings.ts'

const STEPS = [1, 10, TRACK_STEP, 120, 240]

const watch   = await watchOf()
const watched = watch.highest!

describe('the passes of a day', () => {
  it('finds the station rising more than once through the day', () => {
    expect(watch.passes.length).toBeGreaterThan(1)
  })

  it.each(watch.passes)('places the pass peaking at $peak° inside the day, its peak between its rise and set', pass => {
    expect([START, pass.riseAt, pass.peakAt, pass.setAt, START + catalog.DAY]).toEqual(
      [START, pass.riseAt, pass.peakAt, pass.setAt, START + catalog.DAY].sort((a, b) => a - b))
  })

  it('reads the highest pass as the one with the greatest peak', () => {
    expect(watch.highest!.pass.peak).toBe(Math.max(...watch.passes.map(pass => pass.peak)))
  })

  it('reads the scanned pass as the steep pass whose track scan misses its peak by the most', () => {
    const steep = watch.passes.filter(pass => pass.peak >= looks.STEEP).map(pass => watch.watched(pass))
    const miss  = Math.max(...steep.map(pass => pass.miss(TRACK_STEP)))
    expect(watch.scanned!.pass.peak).toBeGreaterThanOrEqual(looks.STEEP)
    expect(watch.scanned!.miss(TRACK_STEP)).toBe(miss)
  })
})

describe('a watched pass', () => {
  it('holds the elevation at every second from one track sample before the rise to one after the set', () => {
    expect(watched.from).toBe(watched.pass.riseAt - TRACK_STEP * 1000)
    expect(watched.to).toBe(watched.pass.setAt + TRACK_STEP * 1000)
  })

  it('keeps each look above the horizon, a look step apart', () => {
    const step = looks.LOOK_STEP * 1000
    expect(watched.looks.every(look => look.elevation >= 0)).toBe(true)
    expect(watched.looks.every(look => (look.time - watched.from) % step === 0)).toBe(true)
  })

  it.each([
    ['on a second', 0, (curve: Float64Array) => curve[0]],
    ['halfway between two seconds', 500, (curve: Float64Array) => (curve[0] + curve[1]) / 2]
  ])('reads the elevation %s from the curve', (_, offset, expected) => {
    expect(watched.elevationAt(watched.from + offset)).toBeCloseTo(expected(watched.curve), 10)
  })

  it.each([
    ['before', watched.from - 1],
    ['after', watched.to + 1]
  ])('reads -90 %s the curve', (_, time) => {
    expect(watched.elevationAt(time)).toBe(-90)
  })

  it.each(STEPS)('samples every %i seconds from the start of the day, keeping only samples above the horizon', step => {
    const times = watched.comb(step)
    expect(times.every(time => (time - START) % (step * 1000) === 0)).toBe(true)
    expect(times.every(time => watched.elevationAt(time) >= 0)).toBe(true)
    expect(times.slice(1).every((time, index) => time - times[index] === step * 1000)).toBe(true)
  })

  it.each(STEPS)('takes the highest of the samples every %i seconds, falling no higher than the peak', step => {
    const highest = watched.elevationAt(watched.highest(step))
    expect(highest).toBe(Math.max(...watched.comb(step).map(time => watched.elevationAt(time))))
    expect(watched.miss(step)).toBe(watched.pass.peak - highest)
    expect(watched.miss(step)).toBeGreaterThan(-0.01)
  })

  it('misses the peak by under a hundredth of a degree when it samples every second', () => {
    expect(watched.miss(1)).toBeLessThan(0.01)
  })
})

describe('a spot the station never climbs high over', () => {
  it('reads the highest pass as the scanned pass where none climbs to STEEP', async () => {
    const far = await watchOf({ latitude: 64, longitude: 0 })
    expect(far.passes.every(pass => pass.peak < looks.STEEP)).toBe(true)
    expect(far.scanned!.pass).toEqual(far.highest!.pass)
  })

  it('reads no highest and no scanned pass where the station never rises', async () => {
    const polar = await watchOf({ latitude: 75, longitude: 0 })
    expect([polar.passes.length, polar.highest, polar.scanned]).toEqual([0, undefined, undefined])
  })
})
