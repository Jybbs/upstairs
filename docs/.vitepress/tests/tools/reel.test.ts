import { statSync } from 'node:fs'
import { join }     from 'node:path'

import sharp                    from 'sharp'
import { describe, expect, it } from 'vitest'

import { SCHEMES, type SchemeName } from '../../lib/site/palette.ts'
import * as reel                    from '../../tools/reel.ts'
import { ROOT }                     from '../fixtures/gh.ts'
import { README }                   from '../fixtures/shipped.ts'

const HOLDING = { hold: 8, refresh: 4 }
const NAMES   = Object.keys(SCHEMES) as SchemeName[]

const fileOf  = (scheme: SchemeName) => join(ROOT, '.github', reel.reelFileOf(scheme))
const frameOf = (...pixels: Uint8Array[]) => Uint8Array.from(pixels.flatMap(pixel => [...pixel]))
const pixel   = (red: number, green = 0, blue = 0) => Uint8Array.of(red, green, blue, 255)

describe('holding the pixels that barely move', () => {

  it.each([
    { before: 100, change: 8,  frame: 1, held: true,  name: 'holds a change at the hold' },
    { before: 100, change: 9,  frame: 1, held: false, name: 'keeps a change past the hold' },
    { before: 100, change: 1,  frame: 4, held: true,  name: 'holds a one-level change on a refresh frame' },
    { before: 100, change: 2,  frame: 4, held: false, name: 'keeps a two-level change on a refresh frame' },
    { before: 100, change: -8, frame: 1, held: true,  name: 'holds a darker change at the hold' }
  ])('$name', ({ before, change, frame, held }) => {
    const still  = Array.from({ length: frame }, () => pixel(before, before, before))
    const frames = reel.heldFramesOf([...still, pixel(before + change, before, before)], HOLDING)
    expect(frames.at(-1)![0]).toBe(held ? before : before + change)
  })

  it('keeps a pixel whose one channel moves past the hold', () =>
    expect([...reel.heldFramesOf([pixel(0), pixel(0, 0, 9)], HOLDING)[1]!]).toEqual([0, 0, 9, 255]))

  it('compares each frame with the frame held before it', () => {
    const frames = reel.heldFramesOf([pixel(100), pixel(105), pixel(110)], HOLDING)
    expect(frames.map(frame => frame[0])).toEqual([100, 100, 110])
  })

  it('holds each pixel of a frame at the color of the frame held before it', () => {
    const frames = reel.heldFramesOf([
      frameOf(pixel(100), pixel(0, 0, 0)),
      frameOf(pixel(120), pixel(0, 0, 9)),
      frameOf(pixel(125), pixel(0, 0, 14))
    ], HOLDING)
    expect(frames.map(frame => [frame[0], frame[6]])).toEqual([[100, 0], [120, 9], [120, 9]])
  })

  it('leaves the frames it was given unchanged', () => {
    const frames = [pixel(100, 100, 100), pixel(104, 100, 100)]
    reel.heldFramesOf(frames, HOLDING)
    expect([...frames[1]!]).toEqual([104, 100, 100, 255])
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
    const frames = [0, 120, 240].map(level => frameOf(...Array(4).fill(pixel(level, level, level))))
    const gif    = reel.reelGifOf(frames, { height: 2, width: 2 })
    expect((await sharp(gif).metadata()).delay).toEqual(frames.map(() => reel.REEL.step))
  })

  it('shows each frame’s own colors where only some of its pixels change', async () => {
    const frames = [[0, 80, 160, 240], [240, 80, 160, 0], [240, 80, 160, 0], [0, 80, 160, 240]]
      .map(levels => frameOf(...levels.map(level => pixel(level))))
    const gif   = reel.reelGifOf(frames, { height: 2, width: 2 })
    const shown = await sharp(gif, { animated: true }).ensureAlpha().raw().toBuffer()
    expect([...shown]).toEqual(frames.flatMap(frame => [...frame]))
  })

  it.each([
    { every: 1, name: 'shows a color only a later frame holds once every frame is sampled', shown: 240 },
    { every: 2, name: 'shows the nearest sampled color for one no sampled frame holds',     shown: 0 }
  ])('$name', async ({ every, shown }) => {
    const frames = [0, 240].map(level => frameOf(pixel(level, level, level)))
    const tuning = { ...reel.REEL, palette: { colors: 255, every } }
    const gif    = reel.reelGifOf(frames, { height: 1, width: 1 }, tuning)
    const pixels = await sharp(gif, { animated: true }).ensureAlpha().raw().toBuffer()
    expect([...pixels.subarray(-4)]).toEqual([...pixel(shown, shown, shown)])
  })

  it('writes a repeated frame in under a third of the bytes a changed frame takes', () => {
    const noise = (step: number) =>
      Uint8Array.from({ length: 16 * 16 * 4 }, (_, at) => at % 4 === 3 ? 255 : at * step % 256)

    const size     = { height: 16, width: 16 }
    const first    = reel.reelGifOf([noise(37)], size).length
    const repeated = reel.reelGifOf([noise(37), noise(37)], size).length - first
    const changed  = reel.reelGifOf([noise(37), noise(53)], size).length - first
    expect(repeated).toBeLessThan(changed / 3)
  })

  it('leaves the palette room for the transparent entry among a GIF’s 256 colors', () =>
    expect(reel.REEL.palette.colors).toBeLessThanOrEqual(255))

  it('shows the night reel under the dark scheme and the day reel under the light one', () =>
    expect(README).toContain([
      `<source media="(prefers-color-scheme: dark)" srcset="${reel.reelFileOf('night')}">`,
      `  <img src="${reel.reelFileOf('day')}"`
    ].join('\n')))

  it('fills the README’s column with the reel', () =>
    expect(README).toMatch(new RegExp(`<img src="${reel.reelFileOf('day')}" alt="[^"]+" width="100%">`)))
})
