import { statSync }      from 'node:fs'
import { fileURLToPath } from 'node:url'

import sharp                    from 'sharp'
import { describe, expect, it } from 'vitest'

import { SCHEMES, type SchemeName } from '../../lib/site/palette.ts'
import * as reel                    from '../../tools/reel.ts'
import { README }                   from '../fixtures/shipped.ts'

const HOLDING = { hold: 8, refresh: 4 }
const NAMES   = Object.keys(SCHEMES) as SchemeName[]

const fileOf = (scheme: SchemeName) =>
  fileURLToPath(new URL(`../../../../.github/${reel.reelFileOf(scheme)}`, import.meta.url))
const pixels = (...levels: number[]) => Buffer.from(levels)

describe('holding the pixels that barely move', () => {

  it.each([
    { before: 100, change: 8,  frame: 1, held: true,  name: 'holds a change at the hold' },
    { before: 100, change: 9,  frame: 1, held: false, name: 'keeps a change past the hold' },
    { before: 100, change: 1,  frame: 4, held: true,  name: 'holds a one-level change on a refresh frame' },
    { before: 100, change: 2,  frame: 4, held: false, name: 'keeps a two-level change on a refresh frame' },
    { before: 100, change: -8, frame: 1, held: true,  name: 'holds a darker change at the hold' }
  ])('$name', ({ before, change, frame, held }) => {
    const still  = Array.from({ length: frame }, () => pixels(before, before, before))
    const frames = reel.heldFramesOf([...still, pixels(before + change, before, before)], HOLDING)
    expect(frames.at(-1)![0]).toBe(held ? before : before + change)
  })

  it('keeps a pixel whose one channel moves past the hold', () =>
    expect([...reel.heldFramesOf([pixels(0, 0, 0), pixels(0, 0, 9)], HOLDING)[1]!]).toEqual([0, 0, 9]))

  it('compares each frame with the frame held before it', () => {
    const frames = reel.heldFramesOf([pixels(100), pixels(105), pixels(110)].map(frame =>
      Buffer.concat([frame, pixels(0, 0)])), HOLDING)
    expect(frames.map(frame => frame[0])).toEqual([100, 100, 110])
  })

  it('leaves the frames it was given unchanged', () => {
    const frames = [pixels(100, 100, 100), pixels(104, 100, 100)]
    reel.heldFramesOf(frames, HOLDING)
    expect([...frames[1]!]).toEqual([104, 100, 100])
  })
})

describe('the reel', () => {
  it('scales the band to the reel’s width', () => expect(reel.reelHeightOf()).toBe(341))

  it.each(NAMES)('ships the %s reel looping forever at 50 frames a second', async scheme => {
    const { delay, height, loop, pages, width } = await sharp(fileOf(scheme)).metadata()
    expect({ height, loop, width }).toEqual({ height: reel.reelHeightOf(), loop: 0, width: reel.REEL.width })
    expect(pages).toBe(reel.REEL.frames)
    expect(new Set(delay)).toEqual(new Set([1000 / 50]))
  })

  it.each(NAMES)('keeps the %s reel at least 800 px wide and under 6 MB', scheme => {
    expect(reel.REEL.width).toBeGreaterThanOrEqual(800)
    expect(statSync(fileOf(scheme)).size).toBeLessThan(6_000_000)
  })

  it('shows every frame of the reel for one step', async () => {
    const frames = [0, 120, 240].map(level => Buffer.alloc(12, level))
    const gif    = await reel.reelGifOf(frames, { channels: 3, height: 2, width: 2 })
    expect((await sharp(gif).metadata()).delay).toEqual(frames.map(() => reel.REEL.step))
  })

  it('shows the night reel under the dark scheme and the day reel under the light one', () =>
    expect(README).toContain([
      `<source media="(prefers-color-scheme: dark)" srcset="${reel.reelFileOf('night')}">`,
      `  <img src="${reel.reelFileOf('day')}"`
    ].join('\n')))

  it('fills the README’s column with the reel', () =>
    expect(README).toMatch(new RegExp(`<img src="${reel.reelFileOf('day')}" alt="[^"]+" width="100%">`)))
})
